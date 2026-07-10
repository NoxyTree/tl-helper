using TlCollector;
using Xunit;

namespace TlCollector.Tests;

public class SamplePlanTests
{
    [Fact]
    public void DefaultTables_CoverTheDocumentedSampleSet()
    {
        var names = SamplePlan.Tables.Select(t => t.Name).ToList();
        var expected = new[]
        {
            "TLItemStats", "TLItemEquip", "TLSkill", "TLSkillLevelSetting",
            "TLPassiveSkillLooks", "TLAbnormalState_Common", "TLCraftingRecipe",
            "TLCookingRecipe", "TLRewardNpcFoItem", "TLRuneInfo",
        };
        Assert.Equal(expected.Length, names.Count);
        foreach (var name in expected)
            Assert.Contains(name, names);
    }

    [Fact]
    public void DefaultTables_AllLiveUnderTheApprovedTableDir()
    {
        Assert.All(SamplePlan.Tables, t =>
        {
            Assert.StartsWith(SamplePlan.TableDir, t.PackagePath);
            Assert.Equal(SampleKind.Table, t.Kind);
        });
    }

    [Fact]
    public void DefaultTables_PassTheForbiddenAssetGate()
    {
        Assert.Empty(SamplePlan.Validate(SamplePlan.Tables));
    }

    [Fact]
    public void ForbiddenPathInSampleList_IsRefused()
    {
        var poisoned = SamplePlan.Tables.Concat(new[]
        {
            new SampleEntry("EvilMovie", "TL/Content/Movies/Intro.bik", SampleKind.Table, "regression: must be refused"),
        });
        var violations = SamplePlan.Validate(poisoned);
        Assert.Single(violations);
        Assert.Contains("EvilMovie", violations[0]);
    }

    [Theory]
    [InlineData("TL/Content/WwiseAudio/Init.bnk")]
    [InlineData("TL/Content/Maps/OpenWorld.umap")]
    [InlineData("TL/Content/Cinematics/Cut1.uasset")]
    public void OtherForbiddenKinds_AreAlsoRefused(string path)
    {
        var entries = new[] { new SampleEntry("Bad", path, SampleKind.Table, "regression") };
        Assert.NotEmpty(SamplePlan.Validate(entries));
    }
}
