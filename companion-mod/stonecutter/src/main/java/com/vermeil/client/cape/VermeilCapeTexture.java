package com.vermeil.client.cape;

import com.mojang.blaze3d.platform.NativeImage;
import java.util.List;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.renderer.texture.TickableTexture;

/**
 * A cape texture that cycles through pre-decoded frames.
 *
 * <p>Implementing {@link TickableTexture} lets the game's texture manager drive
 * the animation: it calls {@link #tick()} once per client tick (render thread).
 */
public class VermeilCapeTexture extends DynamicTexture implements TickableTexture {
	private final List<NativeImage> frames;
	private final long frameTimeMs;
	private final long startMs = System.currentTimeMillis();
	private int currentFrame;

	public VermeilCapeTexture(final NativeImage active, final List<NativeImage> frames, final long frameTimeMs) {
		super(() -> "Vermeil custom cape", active);
		this.frames = frames;
		this.frameTimeMs = Math.max(1L, frameTimeMs);
	}

	@Override
	public void tick() {
		if (frames.size() <= 1) {
			return;
		}
		long elapsed = System.currentTimeMillis() - startMs;
		int index = (int) ((elapsed / frameTimeMs) % frames.size());
		if (index != currentFrame) {
			currentFrame = index;
			NativeImage pixels = getPixels();
			if (pixels != null) {
				pixels.copyFrom(frames.get(index));
				upload();
			}
		}
	}

	@Override
	public void close() {
		super.close();
		for (NativeImage frame : frames) {
			frame.close();
		}
	}
}
