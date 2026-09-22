package com.vermeil.client.mixin;

import com.vermeil.client.gui.VermeilLogoButton;
import com.vermeil.client.gui.VermeilSettingsScreen;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin({PauseScreen.class, TitleScreen.class})
public abstract class VermeilMenuButtonMixin extends Screen {
	@Unique
	private static final int VERMEIL_BUTTON_SIZE = 20;

	protected VermeilMenuButtonMixin(final Component title) {
		super(title);
	}

	@Inject(method = "init", at = @At("TAIL"))
	private void vermeil$addButton(final CallbackInfo ci) {
		final Screen self = (Screen) (Object) this;
		final int bx;
		final int by;
		if (self instanceof TitleScreen) {
			final AbstractWidget quit = vermeil$findButtonByTransKey("menu.quit");
			if (quit != null) {
				bx = quit.getRight() + VERMEIL_BUTTON_SIZE + 8;
				by = quit.getY();
			} else {
				bx = this.width / 2 + 104 + VERMEIL_BUTTON_SIZE + 4;
				by = this.height / 4 + 48 + 72 + 12;
			}
		} else {
			final AbstractWidget bottom = vermeil$lowestWideButton();
			if (bottom != null) {
				bx = bottom.getRight() + 4;
				by = bottom.getY();
			} else {
				bx = this.width / 2 + 104 + 4;
				by = this.height / 4 + 120 + 24;
			}
		}
		this.addRenderableWidget(
			new VermeilLogoButton(bx, by, VERMEIL_BUTTON_SIZE,
				() -> {
					//? if >=26.2 {
					Minecraft.getInstance().gui.setScreen(new VermeilSettingsScreen(self));
					//?}
					//? if <26.2 {
					/*Minecraft.getInstance().setScreen(new VermeilSettingsScreen(self));
					*///?}
				}));
	}

	@Unique
	private AbstractWidget vermeil$findButtonByTransKey(final String key) {
		for (final GuiEventListener child : this.children()) {
			if (child instanceof AbstractWidget widget) {
				final Component msg = widget.getMessage();
				if (msg != null) {
					if (msg.getContents() instanceof TranslatableContents tc && key.equals(tc.getKey())) {
						return widget;
					}
					if (Component.translatable(key).getString().equals(msg.getString())) {
						return widget;
					}
				}
			}
		}
		return null;
	}

	@Unique
	private AbstractWidget vermeil$lowestWideButton() {
		AbstractWidget found = null;
		for (final GuiEventListener child : this.children()) {
			if (child instanceof AbstractWidget widget && widget.getWidth() >= 90) {
				if (found == null || widget.getY() > found.getY()) {
					found = widget;
				}
			}
		}
		return found;
	}
}
