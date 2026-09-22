package com.vermeil;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

//? if fabric {
import net.fabricmc.api.ModInitializer;
import net.fabricmc.loader.api.FabricLoader;
//?}

//? if neoforge {
/*import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.ModList;
*///?}

//? if neoforge {
/*@Mod(VermeilMod.MOD_ID)
*///?}
public class VermeilMod //? if fabric {
implements ModInitializer
//?}
{
    public static final String MOD_ID = "vermeil";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    public static String version() {
        //? if fabric {
        return FabricLoader.getInstance().getModContainer(MOD_ID)
            .map(c -> c.getMetadata().getVersion().getFriendlyString())
            .orElse("0.2.0");
        //?}
        //? if neoforge {
        /*return ModList.get().getModContainerById(MOD_ID)
            .map(c -> c.getModInfo().getVersion().toString())
            .orElse("0.2.0");
        *///?}
    }

    //? if neoforge {
    /*public VermeilMod(IEventBus modEventBus) {
        LOGGER.info("Vermeil companion initialized on NeoForge!");
    }
    *///?}

    //? if fabric {
    @Override
    public void onInitialize() {
        LOGGER.info("Vermeil companion initialized on Fabric!");
    }
    //?}
}
