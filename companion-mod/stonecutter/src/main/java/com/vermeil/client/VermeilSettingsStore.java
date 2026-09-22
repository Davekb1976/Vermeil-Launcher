package com.vermeil.client;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.vermeil.VermeilMod;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
//? if fabric {
import net.fabricmc.loader.api.FabricLoader;
//?}
//? if neoforge {
/*import net.neoforged.fml.loading.FMLPaths;
*///?}

/**
 * Read/write access to the mod's settings file
 * ({@code <vermeil.dataDir>/vermeil-settings.json}) for the in-game Vermeil
 * settings screen.
 */
public final class VermeilSettingsStore {
	private static final String DATA_DIR_PROPERTY = "vermeil.dataDir";
	private static final String SETTINGS_FILE = "vermeil-settings.json";

	private VermeilSettingsStore() {
	}

	/** Whether the cape is enabled (default true when unset). */
	public static boolean isCapeEnabled() {
		JsonObject cape = capeObject(read());
		return cape == null || !cape.has("enabled") || cape.get("enabled").getAsBoolean();
	}

	/** Set the cape on/off, preserving the rest of the file. */
	public static void setCapeEnabled(final boolean enabled) {
		JsonObject root = read();
		JsonObject cape = capeObject(root);
		if (cape == null) {
			cape = new JsonObject();
		}
		cape.addProperty("enabled", enabled);
		root.add("cape", cape);
		write(root);
	}

	private static JsonObject capeObject(final JsonObject root) {
		return root.has("cape") && root.get("cape").isJsonObject() ? root.getAsJsonObject("cape") : null;
	}

	private static JsonObject read() {
		Path file = file();
		if (Files.isRegularFile(file)) {
			try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
				return JsonParser.parseReader(reader).getAsJsonObject();
			} catch (Exception e) {
				VermeilMod.LOGGER.warn("Failed to read {}; starting from empty settings.", file, e);
			}
		}
		return new JsonObject();
	}

	private static void write(final JsonObject root) {
		Path file = file();
		try {
			if (file.getParent() != null) {
				Files.createDirectories(file.getParent());
			}
			try (Writer writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
				new GsonBuilder().setPrettyPrinting().create().toJson(root, writer);
			}
			VermeilMod.LOGGER.info("Saved Vermeil settings to {}.", file);
		} catch (Exception e) {
			VermeilMod.LOGGER.error("Failed to write {}; in-game change not saved.", file, e);
		}
	}

	private static Path file() {
		String override = System.getProperty(DATA_DIR_PROPERTY);
		if (override != null && !override.isBlank()) {
			return Path.of(override).resolve(SETTINGS_FILE);
		}
		Path dir;
		//? if fabric {
		dir = FabricLoader.getInstance().getGameDir().resolve("vermeil");
		//?}
		//? if neoforge {
		/*dir = FMLPaths.GAMEDIR.get().resolve("vermeil");
		*///?}
		return dir.resolve(SETTINGS_FILE);
	}
}
