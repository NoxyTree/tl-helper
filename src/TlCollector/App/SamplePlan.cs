namespace TlCollector;

public enum SampleKind
{
    Table,          // raw .uasset + property JSON
    Localization,   // raw .locres
    Texture,        // decoded PNG
    DifficultCase,  // raw + property attempt; failures are recorded, not fought
}

public sealed record SampleEntry(string Name, string PackagePath, SampleKind Kind, string Rationale);

/// <summary>
/// The fixed, documented representative sample for Milestone 1 stabilization.
/// Table paths are static; localization, texture, and the difficult case are
/// resolved against the mounted archive at runtime and validated with the
/// same forbidden-asset rules before any processing starts.
/// </summary>
public static class SamplePlan
{
    public const string TableDir = "TL/Content/Game/Client/Table/";

    private static SampleEntry Table(string name, string rationale) =>
        new(name, TableDir + name, SampleKind.Table, rationale);

    public static IReadOnlyList<SampleEntry> Tables { get; } = new[]
    {
        Table("TLItemStats", "equipment stats"),
        Table("TLItemEquip", "equipment definitions"),
        Table("TLSkill", "skills; ~25MB raw payload, the main Milestone 3 decoder target"),
        Table("TLSkillLevelSetting", "skill level scaling"),
        Table("TLPassiveSkillLooks", "passive skill presentation"),
        Table("TLAbnormalState_Common", "buffs / status effects"),
        Table("TLCraftingRecipe", "crafting recipes"),
        Table("TLCookingRecipe", "cooking recipes"),
        Table("TLRewardNpcFoItem", "loot / acquisition rewards"),
        Table("TLRuneInfo", "known-good small table family"),
    };

    /// <summary>
    /// Returns one error per entry whose package path violates the forbidden
    /// asset rules. The runner refuses to process a plan with any violation.
    /// </summary>
    public static IReadOnlyList<string> Validate(IEnumerable<SampleEntry> entries) =>
        entries
            .Where(e => !ForbiddenAssetFilter.IsAllowed(e.PackagePath))
            .Select(e => $"Sample entry '{e.Name}' has a forbidden package path: {e.PackagePath}")
            .ToList();
}
