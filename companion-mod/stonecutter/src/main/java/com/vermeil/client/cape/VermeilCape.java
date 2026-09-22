package com.vermeil.client.cape;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import com.vermeil.VermeilMod;
import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
//? if fabric {
import net.fabricmc.loader.api.FabricLoader;
//?}
//? if neoforge {
/*import net.neoforged.fml.loading.FMLPaths;
*///?}
import net.minecraft.client.Minecraft;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;

/**
 * Manages the launcher's in-game custom cape on the client.
 */
public final class VermeilCape {
	public static final Identifier CAPE_ID = Identifier.fromNamespaceAndPath("vermeil", "cape");

	private static final String DATA_DIR_PROPERTY = "vermeil.dataDir";
	private static final String SETTINGS_FILE = "vermeil-settings.json";
	private static final String CAPE_SUBDIR = "cape";
	private static final String CAPE_FILE = "cape.png";

	private static final long DEFAULT_FRAME_TIME_MS = 100L;
	private static final long MAX_TEXTURE_BYTES = 64L * 1024L * 1024L;
	private static final int RELOAD_INTERVAL_TICKS = 20;

	private static final ClientAsset.Texture CAPE_TEXTURE = new ClientAsset.ResourceTexture(CAPE_ID, CAPE_ID);

	private static boolean active;
	private static boolean capeDisabled;
	private static String lastSignature = "";
	private static int tickCounter;

	private VermeilCape() {
	}

	private static Path capeDir() {
		String override = System.getProperty(DATA_DIR_PROPERTY);
		if (override != null && !override.isBlank()) {
			return Path.of(override);
		}
		//? if fabric {
		return FabricLoader.getInstance().getGameDir().resolve("vermeil");
		//?}
		//? if neoforge {
		/*return FMLPaths.GAMEDIR.get().resolve("vermeil");
		*///?}
	}

	public static ClientAsset.Texture capeTexture() {
		return CAPE_TEXTURE;
	}

	public static boolean isActive() {
		return active;
	}

	public static boolean isCapeDisabled() {
		return capeDisabled;
	}

	public static void tickReload(final Minecraft minecraft) {
		if (minecraft.player == null) {
			return;
		}
		if (tickCounter++ % RELOAD_INTERVAL_TICKS != 0) {
			return;
		}
		String signature = currentSignature();
		if (signature.equals(lastSignature)) {
			return;
		}
		lastSignature = signature;
		reload(minecraft);
	}

	public static void refresh(final Minecraft minecraft) {
		if (minecraft == null) {
			return;
		}
		lastSignature = currentSignature();
		reload(minecraft);
	}

	private static void reload(final Minecraft minecraft) {
		Path capeFile = capeDir().resolve(CAPE_SUBDIR).resolve(CAPE_FILE);
		CapeSettings settings = readSettings();
		capeDisabled = !settings.enabled();

		if (!settings.enabled() || !Files.isRegularFile(capeFile)) {
			deactivate(minecraft, settings.enabled() ? "no cape file" : "disabled");
			return;
		}

		try (InputStream in = Files.newInputStream(capeFile)) {
			VermeilCapeTexture texture = buildTexture(NativeImage.read(in), settings.frameTimeMs());
			minecraft.getTextureManager().register(CAPE_ID, texture);
			active = true;
		} catch (IOException e) {
			VermeilMod.LOGGER.error("Failed to read custom cape texture from {}; not showing a cape.", capeFile, e);
			deactivate(minecraft, "unreadable cape file");
		}
	}

	private static void deactivate(final Minecraft minecraft, final String reason) {
		if (active) {
			minecraft.getTextureManager().release(CAPE_ID);
			active = false;
			VermeilMod.LOGGER.info("Custom cape removed ({}).", reason);
		}
	}

	private static VermeilCapeTexture buildTexture(final NativeImage sheet, final long frameTimeMs) {
		int width = sheet.getWidth();
		int height = sheet.getHeight();
		int frameCount = (width > 0 && height > width && height % width == 0) ? height / width : 1;

		if (frameCount <= 1) {
			int capeHeight = Math.min(height, Math.max(1, width / 2));
			NativeImage frame = cropFrame(sheet, 0, width, capeHeight);
			sheet.close();
			VermeilMod.LOGGER.info("Loaded custom cape texture ({}x{}, static).", width, capeHeight);
			return new VermeilCapeTexture(frame, List.of(), frameTimeMs);
		}

		final int capeHeight = Math.max(1, width / 2);
		long perFrameBytes = (long) width * capeHeight * 4L;
		int maxFrames = (int) Math.max(1L, MAX_TEXTURE_BYTES / perFrameBytes);
		if (frameCount > maxFrames) {
			VermeilMod.LOGGER.warn("Cape strip has {} frames; capping to {} to bound memory.", frameCount, maxFrames);
			frameCount = maxFrames;
		}

		List<NativeImage> frames = new ArrayList<>(frameCount);
		for (int f = 0; f < frameCount; f++) {
			frames.add(cropFrame(sheet, f * width, width, capeHeight));
		}
		sheet.close();
		NativeImage activeFrame = new NativeImage(width, capeHeight, false);
		activeFrame.copyFrom(frames.get(0));

		VermeilMod.LOGGER.info("Loaded custom cape texture ({}x{}, {} frames @ {}ms).", width, capeHeight, frameCount, frameTimeMs);
		return new VermeilCapeTexture(activeFrame, frames, frameTimeMs);
	}

	private static NativeImage cropFrame(final NativeImage sheet, final int baseY, final int width, final int h) {
		NativeImage frame = new NativeImage(width, h, false);
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < width; x++) {
				frame.setPixelABGR(x, y, argbToAbgr(sheet.getPixel(x, baseY + y)));
			}
		}
		return frame;
	}

	private static CapeSettings readSettings() {
		Path settings = capeDir().resolve(SETTINGS_FILE);
		boolean enabled = true;
		long frameTimeMs = DEFAULT_FRAME_TIME_MS;
		if (Files.isRegularFile(settings)) {
			try (Reader reader = Files.newBufferedReader(settings)) {
				JsonObject root = JsonParser.parseReader(reader).getAsJsonObject();
				JsonObject cape = root.has("cape") ? root.getAsJsonObject("cape") : null;
				if (cape != null) {
					if (cape.has("enabled")) {
						enabled = cape.get("enabled").getAsBoolean();
					}
					if (cape.has("frameTimeMs")) {
						long value = cape.get("frameTimeMs").getAsLong();
						if (value > 0L) {
							frameTimeMs = value;
						}
					}
				}
			} catch (Exception e) {
				VermeilMod.LOGGER.warn("Failed to read Vermeil settings {}; using cape defaults.", settings, e);
			}
		}
		return new CapeSettings(enabled, frameTimeMs);
	}

	private static String currentSignature() {
		Path dir = capeDir();
		return fileSignature(dir.resolve(CAPE_SUBDIR).resolve(CAPE_FILE)) + "|" + fileSignature(dir.resolve(SETTINGS_FILE));
	}

	private static String fileSignature(final Path path) {
		if (!Files.isRegularFile(path)) {
			return "-";
		}
		try {
			return Files.size(path) + ":" + Files.getLastModifiedTime(path).toMillis();
		} catch (IOException e) {
			return "?";
		}
	}

	private static int argbToAbgr(final int argb) {
		int a = (argb >>> 24) & 0xFF;
		int r = (argb >> 16) & 0xFF;
		int g = (argb >> 8) & 0xFF;
		int b = argb & 0xFF;
		return (a << 24) | (b << 16) | (g << 8) | r;
	}

	private record CapeSettings(boolean enabled, long frameTimeMs) {
	}
}
