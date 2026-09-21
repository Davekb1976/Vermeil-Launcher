package com.vermeil;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

//? if fabric {
import net.fabricmc.api.ModInitializer;
//?}

//? if neoforge {
/*import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
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
