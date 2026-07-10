using TlCollector;
using Xunit;

namespace TlCollector.Tests;

public class SteamAppManifestTests
{
    private const string SampleAcf = """
        "AppState"
        {
        	"appid"		"2429640"
        	"name"		"Throne and Liberty"
        	"StateFlags"		"4"
        	"buildid"		"24118850"
        	"LastUpdated"		"1751000000"
        }
        """;

    [Fact]
    public void ParseBuildId_ExtractsNumericBuildId()
    {
        Assert.Equal("24118850", SteamAppManifest.ParseBuildId(SampleAcf));
    }

    [Fact]
    public void ParseBuildId_ReturnsNullWhenMissing()
    {
        Assert.Null(SteamAppManifest.ParseBuildId("\"AppState\" { \"appid\" \"1\" }"));
    }

    [Fact]
    public void ParseBuildId_IgnoresNonNumericBuildId()
    {
        Assert.Null(SteamAppManifest.ParseBuildId("\"buildid\"\t\"not-a-number\""));
    }

    [Fact]
    public void LoadBuildId_ReturnsNullForMissingFile()
    {
        Assert.Null(SteamAppManifest.LoadBuildId(@"C:\definitely\missing\appmanifest_0.acf"));
    }
}
