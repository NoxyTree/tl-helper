using TlCollector;
using Xunit;

namespace TlCollector.Tests;

/// <summary>
/// Tests wired to the small committed fixtures under fixtures/24118850.
/// They verify hash stability of collector outputs without needing the game
/// archives or the AES key. Provenance: fixtures/README.md.
/// </summary>
public class FixtureTests
{
    private const string Build = "24118850";

    private static string FixturesDir()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            var dir = new DirectoryInfo(start);
            for (var i = 0; dir is not null && i < 10; i++, dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, "fixtures", Build);
                if (Directory.Exists(candidate))
                    return candidate;
            }
        }
        throw new DirectoryNotFoundException(
            $"fixtures/{Build} not found above {AppContext.BaseDirectory}. See fixtures/README.md.");
    }

    [Theory]
    [InlineData("TLRuneInfo.uasset", 29301,
        "6a4c2e3e8ce87cacfc5766f0ea8ad2e9957e01b5010fcf634921ed9610ed7961")]
    [InlineData("TLSkillLevelSetting.uasset", 1561,
        "48f4fe33af76a9dc8d49bbffcd1f3ea80c104935a52b4a6e939dec1d997e81fe")]
    [InlineData("I_Ammo_0.png", 11482,
        "0496d492e9edd369e64996e4528166b418d8eb82a661aaf95218f9cdbf68cdee")]
    public void FixtureHashes_MatchDocumentedProvenance(string name, long bytes, string sha256)
    {
        var path = Path.Combine(FixturesDir(), name);
        Assert.True(File.Exists(path), $"Missing fixture: {path}");
        Assert.Equal(bytes, new FileInfo(path).Length);
        Assert.Equal(sha256, HashUtil.Sha256HexOfFile(path));
    }

    [Fact]
    public void FixtureSourcePackagePaths_PassTheForbiddenAssetFilter()
    {
        // The internal package paths these fixtures came from must always be
        // approved by the exclusion rules.
        var sourcePaths = new[]
        {
            "TL/Content/Game/Client/Table/TLRuneInfo.uasset",
            "TL/Content/Game/Client/Table/TLSkillLevelSetting.uasset",
            "TL/Content/Image/Icon/Item_128/AMMO/I_Ammo_0.uasset",
        };
        Assert.All(sourcePaths, p => Assert.True(ForbiddenAssetFilter.IsAllowed(p)));
    }

    [Fact]
    public void FixturePngDecodesAsPng()
    {
        var bytes = File.ReadAllBytes(Path.Combine(FixturesDir(), "I_Ammo_0.png"));
        // PNG magic number.
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47 }, bytes.Take(4).ToArray());
    }

    [Fact]
    public void TotalFixtureSize_StaysSmall()
    {
        var total = new DirectoryInfo(FixturesDir()).GetFiles().Sum(f => f.Length);
        Assert.True(total < 1_000_000, $"Fixtures must stay under ~1 MB, got {total} bytes.");
    }
}
