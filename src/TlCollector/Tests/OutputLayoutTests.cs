using TlCollector;
using Xunit;

namespace TlCollector.Tests;

public class OutputLayoutTests
{
    private const string DataRoot = @"D:\TL_Data";

    [Fact]
    public void AllPaths_AreStampedWithTheBuildId()
    {
        var layout = new OutputLayout(DataRoot, "24118850");
        foreach (var dir in layout.AllOutputDirs)
            Assert.Contains(@"\24118850\", dir + @"\");
        Assert.Contains(@"\24118850\", layout.ManifestPath);
        Assert.Contains(@"\24118850\", layout.VerificationPath);
    }

    [Fact]
    public void CollectorOutputs_GoUnderRawBuildCollector()
    {
        var layout = new OutputLayout(DataRoot, "24118850");
        Assert.Equal(@"D:\TL_Data\raw\24118850\collector", layout.RawCollectorDir);
        Assert.Equal(@"D:\TL_Data\raw\24118850\collector\raw-tables", layout.RawTablesDir);
        Assert.Equal(@"D:\TL_Data\raw\24118850\collector\properties", layout.PropertiesDir);
        Assert.Equal(@"D:\TL_Data\raw\24118850\collector\textures", layout.TexturesDir);
        Assert.Equal(@"D:\TL_Data\raw\24118850\collector\localization", layout.LocalizationDir);
        Assert.Equal(@"D:\TL_Data\manifests\24118850", layout.ManifestDir);
        Assert.Equal(@"D:\TL_Data\manifests\24118850\manifest.json", layout.ManifestPath);
    }

    [Fact]
    public void DifferentBuilds_ProduceFullyDisjointDirectories()
    {
        var a = new OutputLayout(DataRoot, "24118850");
        var b = new OutputLayout(DataRoot, "24999999");
        var dirsA = a.AllOutputDirs.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var dir in b.AllOutputDirs)
        {
            Assert.DoesNotContain(dir, dirsA);
            // No containment either way: a build directory can never nest inside another build's.
            foreach (var dirA in dirsA)
            {
                Assert.False(PathSafety.IsSameOrContainedWithin(dir, dirA));
                Assert.False(PathSafety.IsSameOrContainedWithin(dirA, dir));
            }
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("current")]     // non-numeric labels refused
    [InlineData("24118850x")]
    [InlineData(@"..\evil")]    // path traversal refused
    public void InvalidBuildIds_AreRefused(string buildId)
    {
        Assert.Throws<ArgumentException>(() => new OutputLayout(DataRoot, buildId));
    }

    [Fact]
    public void EmptyDataRoot_IsRefused()
    {
        Assert.Throws<ArgumentException>(() => new OutputLayout("", "24118850"));
    }
}
