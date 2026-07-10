using System.Text.Json;
using TlCollector;
using Xunit;

namespace TlCollector.Tests;

/// <summary>
/// Config and key-resolution tests. These use synthetic throwaway keys only —
/// no real AES key, game archive, or game install is required or touched.
/// </summary>
public class CollectorConfigTests : IDisposable
{
    private static readonly string FakeKeyHex = new string('a', 64); // synthetic, NOT the real key
    private readonly string _tempDir;

    public CollectorConfigTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "TlCollectorTests_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { }
    }

    private string WriteTemp(string name, string content)
    {
        var path = Path.Combine(_tempDir, name);
        File.WriteAllText(path, content);
        return path;
    }

    [Fact]
    public void NormalizeAesKey_AddsPrefixAndValidates()
    {
        Assert.Equal("0x" + FakeKeyHex, CollectorConfig.NormalizeAesKey(FakeKeyHex));
        Assert.Equal("0x" + FakeKeyHex, CollectorConfig.NormalizeAesKey("0x" + FakeKeyHex));
        Assert.Equal("0x" + FakeKeyHex, CollectorConfig.NormalizeAesKey("  " + FakeKeyHex + "  "));
    }

    [Theory]
    [InlineData("")]
    [InlineData("1234")]                    // too short
    [InlineData("zz")]                      // not hex
    public void NormalizeAesKey_RejectsMalformedKeys(string bad)
    {
        Assert.Throws<InvalidOperationException>(() => CollectorConfig.NormalizeAesKey(bad));
    }

    [Fact]
    public void NormalizeAesKey_RejectsNonHexOfCorrectLength()
    {
        var bad = new string('g', 64);
        Assert.Throws<InvalidOperationException>(() => CollectorConfig.NormalizeAesKey(bad));
    }

    [Fact]
    public void ResolveAesKey_ReadsSnakeCaseFieldFromSourceFile()
    {
        var source = WriteTemp("manifest.json", JsonSerializer.Serialize(new { aes_key = FakeKeyHex }));
        var config = new CollectorConfig { AesKeySource = source };
        Assert.Equal("0x" + FakeKeyHex, config.ResolveAesKey());
    }

    [Fact]
    public void ResolveAesKey_PrefersDirectKeyOverSource()
    {
        var otherKey = new string('b', 64);
        var source = WriteTemp("manifest.json", JsonSerializer.Serialize(new { aes_key = FakeKeyHex }));
        var config = new CollectorConfig { AesKey = otherKey, AesKeySource = source };
        Assert.Equal("0x" + otherKey, config.ResolveAesKey());
    }

    [Fact]
    public void ResolveAesKey_ThrowsWhenSourceLacksKeyField()
    {
        var source = WriteTemp("manifest.json", """{"game":"TL"}""");
        var config = new CollectorConfig { AesKeySource = source };
        Assert.Throws<InvalidOperationException>(() => config.ResolveAesKey());
    }

    [Fact]
    public void ResolveAesKey_ThrowsWhenSourceFileMissing()
    {
        var config = new CollectorConfig { AesKeySource = Path.Combine(_tempDir, "nope.json") };
        Assert.Throws<FileNotFoundException>(() => config.ResolveAesKey());
    }

    [Fact]
    public void ResolveAesKey_ThrowsWhenNothingConfigured()
    {
        Assert.Throws<InvalidOperationException>(() => new CollectorConfig().ResolveAesKey());
    }

    [Fact]
    public void Load_ParsesCaseInsensitiveWithComments()
    {
        var path = WriteTemp("config.json", """
            {
              // comment allowed
              "GAMEPAKSDIRECTORY": "D:\\Games\\TL\\TL\\Content\\Paks",
              "dataroot": "D:\\Out",
              "aeskeysource": "D:\\keys.json",
            }
            """);
        var config = CollectorConfig.Load(path);
        Assert.Equal(@"D:\Games\TL\TL\Content\Paks", config.GamePaksDirectory);
        Assert.Equal(@"D:\Out", config.DataRoot);
        Assert.Equal(@"D:\keys.json", config.AesKeySource);
    }

    [Fact]
    public void Validate_FlagsMissingRequiredFields()
    {
        var errors = new CollectorConfig().Validate();
        Assert.Contains(errors, e => e.Contains("gamePaksDirectory"));
        Assert.Contains(errors, e => e.Contains("dataRoot"));
        Assert.Contains(errors, e => e.Contains("aesKey"));
    }

    [Fact]
    public void Validate_FlagsOutputInsideGameInstall()
    {
        var config = new CollectorConfig
        {
            GamePaksDirectory = @"D:\Games\ThroneAndLiberty\TL\Content\Paks",
            DataRoot = @"D:\Games\ThroneAndLiberty\extracted",
            AesKey = FakeKeyHex,
        };
        Assert.NotEmpty(config.Validate());
    }

    [Fact]
    public void Validate_AcceptsSafeConfiguration()
    {
        var config = new CollectorConfig
        {
            GamePaksDirectory = @"D:\Games\ThroneAndLiberty\TL\Content\Paks",
            DataRoot = @"D:\TL_Data",
            AesKey = FakeKeyHex,
        };
        Assert.Empty(config.Validate());
    }

    [Fact]
    public void Sha256Hex_MatchesKnownVector()
    {
        Assert.Equal(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            HashUtil.Sha256Hex("abc"u8.ToArray()));
    }
}
