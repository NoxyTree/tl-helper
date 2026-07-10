using TlCollector;
using Xunit;

namespace TlCollector.Tests;

public class PathSafetyTests
{
    private const string Paks = @"D:\SteamLibrary\steamapps\common\Throne and Liberty\TL\Content\Paks";
    private const string GameRoot = @"D:\SteamLibrary\steamapps\common\Throne and Liberty";

    [Fact]
    public void DeriveGameInstallRoot_TrimsTlContentPaks()
    {
        Assert.Equal(GameRoot, PathSafety.DeriveGameInstallRoot(Paks));
    }

    [Fact]
    public void DeriveGameInstallRoot_HandlesForwardSlashesAndTrailingSeparator()
    {
        var derived = PathSafety.DeriveGameInstallRoot(
            "D:/SteamLibrary/steamapps/common/Throne and Liberty/TL/Content/Paks/");
        Assert.Equal(GameRoot, derived);
    }

    [Fact]
    public void DeriveGameInstallRoot_FallsBackToPaksDirWithoutMarker()
    {
        Assert.Equal(@"D:\SomeGame\Data", PathSafety.DeriveGameInstallRoot(@"D:\SomeGame\Data"));
    }

    [Theory]
    [InlineData(Paks)]                                             // output == source archive dir
    [InlineData(Paks + @"\out")]                                   // inside the paks dir
    [InlineData(GameRoot)]                                         // the game install root itself
    [InlineData(GameRoot + @"\TL\Content")]                        // elsewhere inside the install
    [InlineData(GameRoot + @"\extracted")]                         // new folder inside the install
    [InlineData(@"d:\steamlibrary\STEAMAPPS\common\THRONE AND LIBERTY\output")] // case differences
    public void ValidateOutputRoot_RejectsOutputInsideGameInstall(string output)
    {
        var errors = PathSafety.ValidateOutputRoot(output, Paks);
        Assert.NotEmpty(errors);
    }

    [Fact]
    public void ValidateOutputRoot_RejectsOutputEqualToSourceViaRelativeSegments()
    {
        var sneaky = Paks + @"\..\Paks";
        var errors = PathSafety.ValidateOutputRoot(sneaky, Paks);
        Assert.NotEmpty(errors);
    }

    [Fact]
    public void ValidateOutputRoot_RejectsOutputContainingGameInstall()
    {
        // Writing "into" a parent of the install is refused as well.
        var errors = PathSafety.ValidateOutputRoot(@"D:\SteamLibrary\steamapps\common", Paks);
        Assert.NotEmpty(errors);
    }

    [Theory]
    [InlineData(@"D:\TL_Data")]
    [InlineData(@"C:\Temp\tl-out")]
    [InlineData(@"D:\SteamLibrary\steamapps\common\Throne and Liberty Extracted")] // sibling with shared prefix string
    public void ValidateOutputRoot_AcceptsPathsOutsideGameInstall(string output)
    {
        var errors = PathSafety.ValidateOutputRoot(output, Paks);
        Assert.Empty(errors);
    }

    [Fact]
    public void IsSameOrContainedWithin_DoesNotMatchSiblingWithSharedPrefix()
    {
        Assert.False(PathSafety.IsSameOrContainedWithin(@"D:\Game Extra", @"D:\Game"));
        Assert.True(PathSafety.IsSameOrContainedWithin(@"D:\Game\Sub", @"D:\Game"));
        Assert.True(PathSafety.IsSameOrContainedWithin(@"D:\GAME\sub", @"d:\game"));
    }

    [Fact]
    public void IsWriteAllowed_AllowsInsideRoot_RejectsOutside()
    {
        Assert.True(PathSafety.IsWriteAllowed(@"D:\TL_Data\manifests\24118850\manifest.json", @"D:\TL_Data"));
        Assert.False(PathSafety.IsWriteAllowed(@"D:\TL_Data\..\evil.json", @"D:\TL_Data"));
        Assert.False(PathSafety.IsWriteAllowed(Paks + @"\evil.pak", @"D:\TL_Data"));
    }

    [Fact]
    public void ValidateOutputRoot_ReportsInvalidPathsAsErrors()
    {
        var errors = PathSafety.ValidateOutputRoot("", Paks);
        Assert.NotEmpty(errors);
    }
}
