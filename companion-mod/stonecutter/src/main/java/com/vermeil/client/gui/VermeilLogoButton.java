package com.vermeil.client.gui;

import com.mojang.blaze3d.platform.NativeImage;
import com.vermeil.VermeilMod;
import java.io.IOException;
import java.io.InputStream;
import net.minecraft.client.Minecraft;
//? if >=26.1 {
import net.minecraft.client.gui.GuiGraphicsExtractor;
//?}
//? if <=1.21.11 {
/*import net.minecraft.client.gui.GuiGraphics;
*///?}
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.InputWithModifiers;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;

/**
 * A compact square menu button that draws the vanilla button frame with the
 * Vermeil logo centred and opens the in-game Vermeil settings.
 */
public class VermeilLogoButton extends AbstractButton {
	private static final Identifier LOGO_ID = Identifier.fromNamespaceAndPath("vermeil", "menu_logo");
	private static final String LOGO_RESOURCE = "/assets/vermeil/textures/gui/logo.png";
	private static final int ICON = 16;
	private static final int TEX = 64;

	private static boolean logoRegistered;

	private final Runnable action;

	public VermeilLogoButton(final int x, final int y, final int size, final Runnable action) {
		super(x, y, size, size, Component.literal("Vermeil"));
		this.action = action;
		this.setTooltip(Tooltip.create(Component.literal("Vermeil settings")));
	}

	@Override
	public void onPress(final InputWithModifiers input) {
		action.run();
	}

	@Override
	protected void updateWidgetNarration(final NarrationElementOutput output) {
		this.defaultButtonNarrationText(output);
	}

	//? if >=26.1 {
	@Override
	protected void extractContents(final GuiGraphicsExtractor gfx, final int mouseX, final int mouseY, final float delta) {
		this.extractDefaultSprite(gfx);
		ensureLogoRegistered();
		final int ix = this.getX() + (this.getWidth() - ICON) / 2;
		final int iy = this.getY() + (this.getHeight() - ICON) / 2;
		gfx.blit(RenderPipelines.GUI_TEXTURED, LOGO_ID, ix, iy, 0.0F, 0.0F, ICON, ICON, TEX, TEX, TEX, TEX, ARGB.white(this.alpha));
	}
	//?}
	//? if <=1.21.11 {
	/*@Override
	protected void renderContents(final GuiGraphics gfx, final int mouseX, final int mouseY, final float delta) {
		this.renderDefaultSprite(gfx);
		ensureLogoRegistered();
		final int ix = this.getX() + (this.getWidth() - ICON) / 2;
		final int iy = this.getY() + (this.getHeight() - ICON) / 2;
		gfx.blit(RenderPipelines.GUI_TEXTURED, LOGO_ID, ix, iy, 0.0F, 0.0F, ICON, ICON, TEX, TEX, TEX, TEX, ARGB.white(this.alpha));
	}
	*///?}

	private static void ensureLogoRegistered() {
		if (logoRegistered) {
			return;
		}
		logoRegistered = true;
		try (InputStream in = VermeilLogoButton.class.getResourceAsStream(LOGO_RESOURCE)) {
			if (in == null) {
				VermeilMod.LOGGER.error("Vermeil logo not found on classpath at {}.", LOGO_RESOURCE);
				return;
			}
			final NativeImage image = NativeImage.read(in);
			Minecraft.getInstance().getTextureManager().register(LOGO_ID, new DynamicTexture(() -> "Vermeil menu logo", image));
		} catch (IOException e) {
			VermeilMod.LOGGER.error("Failed to load Vermeil logo texture.", e);
		}
	}
}
