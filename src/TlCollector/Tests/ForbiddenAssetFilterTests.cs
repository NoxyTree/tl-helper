using TlCollector;
using Xunit;

namespace TlCollector.Tests;

public class ForbiddenAssetFilterTests
{
    [Theory]
    [InlineData("TL/Content/Movies/Intro.bik")]
    [InlineData("TL/Content/Movies/Logo.bk2")]
    [InlineData("TL/Content/Cine/clip.mp4")]
    [InlineData("TL/Content/WwiseAudio/Media/12345.wem")]
    [InlineData("TL/Content/WwiseAudio/Init.bnk")]
    [InlineData("TL/Content/Sound/music.ogg")]
    [InlineData("TL/Content/Sound/voice.wav")]
    [InlineData("TL/Content/Maps/OpenWorld.umap")]
    public void ForbiddenExtensions_AreRejected(string path)
    {
        Assert.True(ForbiddenAssetFilter.IsForbiddenExtension(path));
        Assert.False(ForbiddenAssetFilter.IsAllowed(path));
    }

    [Theory]
    [InlineData("TL/Content/Game/Client/Table/TLRuneInfo.uasset")]
    [InlineData("TL/Content/Game/Client/Table/TLSkill.ubulk")]
    [InlineData("TL/Content/Image/Icon/Item_128/IT_P_00001.uasset")]
    [InlineData("TL/Content/Localization/Game/en/Game.locres")]
    public void ApprovedDataAndTexturePaths_AreAllowed(string path)
    {
        Assert.False(ForbiddenAssetFilter.IsForbiddenExtension(path));
        Assert.True(ForbiddenAssetFilter.IsAllowed(path));
    }

    [Theory]
    [InlineData("SoundWave")]
    [InlineData("soundwave")] // case-insensitive
    [InlineData("SoundCue")]
    [InlineData("AkAudioEvent")]
    [InlineData("StaticMesh")]
    [InlineData("SkeletalMesh")]
    [InlineData("Skeleton")]
    [InlineData("AnimSequence")]
    [InlineData("AnimMontage")]
    [InlineData("MediaTexture")]
    [InlineData("BinkMediaPlayer")]
    [InlineData("World")]
    [InlineData("LevelSequence")]
    public void ForbiddenClasses_AreRejected(string className)
    {
        Assert.True(ForbiddenAssetFilter.IsForbiddenClass(className));
        Assert.False(ForbiddenAssetFilter.IsAllowed("TL/Content/Whatever/x.uasset", className));
    }

    [Theory]
    [InlineData("Texture2D")]
    [InlineData("TLJsonDataTable")]
    [InlineData("DataTable")]
    [InlineData(null)]
    [InlineData("")]
    public void AllowedClasses_AreAccepted(string? className)
    {
        Assert.False(ForbiddenAssetFilter.IsForbiddenClass(className));
        Assert.True(ForbiddenAssetFilter.IsAllowed("TL/Content/Game/Client/Table/x.uasset", className));
    }

    [Theory]
    [InlineData("TL/Content/Movies/anything.uasset")]      // movie folder, harmless extension
    [InlineData(@"TL\Content\WwiseAudio\bank.uasset")]     // backslash form
    [InlineData("TL/Content/Cinematics/Cut1.uasset")]
    public void ForbiddenPathSegments_AreRejected(string path)
    {
        Assert.True(ForbiddenAssetFilter.IsForbiddenPath(path));
        Assert.False(ForbiddenAssetFilter.IsAllowed(path));
    }

    [Fact]
    public void UassetUnderApprovedTablePath_IsNotFlaggedByPathFilter()
    {
        Assert.False(ForbiddenAssetFilter.IsForbiddenPath("TL/Content/Game/Client/Table/TLRuneInfo.uasset"));
    }
}
