use tauri::{AppHandle, Manager, Runtime};

#[cfg(target_os = "macos")]
pub use macos::center_in_header;

#[cfg(not(target_os = "macos"))]
pub fn center_in_header(_window: &tauri::WebviewWindow) {}

pub fn raise_main<R: Runtime>(app: &AppHandle<R>) {
	let Some(window) = app.get_webview_window("main") else {
		return;
	};
	let _ = window.unminimize();
	let _ = window.show();
	let _ = window.set_focus();
}

#[cfg(target_os = "macos")]
mod macos {
	use objc2::rc::Retained;
	use objc2_app_kit::{NSButton, NSView, NSWindow, NSWindowButton, NSWindowStyleMask};
	use objc2_foundation::NSPoint;
	use tauri::{WebviewWindow, WindowEvent};

	const LEADING_INSET: f64 = 17.5;
	const HEADER_BOX_HEIGHT: f64 = 47.0;
	const CONTROL_DIAMETER: f64 = 12.0;

	pub fn center_in_header(window: &WebviewWindow) {
		place(window);
		let subject = window.clone();
		window.on_window_event(move |event| {
			if !matches!(event, WindowEvent::Resized(_)) {
				return;
			}
			let replaced = subject.clone();
			let _ = subject.run_on_main_thread(move || place(&replaced));
		});
	}

	fn place(window: &WebviewWindow) {
		let Some(ns_window) = main_window(window) else {
			return;
		};
		if ns_window.styleMask().contains(NSWindowStyleMask::FullScreen) {
			return;
		}
		let Some(controls) = window_buttons(&ns_window) else {
			return;
		};
		let Some(titlebar) = titlebar_of(&controls[0]) else {
			return;
		};

		let control = controls[0].frame();
		let spacing = controls[1].frame().origin.x - control.origin.x;
		let top = frame_top(control.size.height);
		let titlebar_height = fit_titlebar(&ns_window, &titlebar, top + control.size.height);

		let origin_x = LEADING_INSET - visible_inset(control.size.width);
		let origin_y = titlebar_height - top - control.size.height;
		for (rank, button) in controls.iter().enumerate() {
			button.setFrameOrigin(NSPoint::new(origin_x + rank as f64 * spacing, origin_y));
		}
	}

	fn visible_inset(measured: f64) -> f64 {
		(measured - CONTROL_DIAMETER) / 2.0
	}

	fn frame_top(measured_height: f64) -> f64 {
		(HEADER_BOX_HEIGHT - CONTROL_DIAMETER) / 2.0 - visible_inset(measured_height)
	}

	fn fit_titlebar(ns_window: &NSWindow, titlebar: &NSView, height: f64) -> f64 {
		let mut frame = titlebar.frame();
		frame.origin.y = ns_window.frame().size.height - height;
		frame.size.height = height;
		titlebar.setFrame(frame);
		titlebar.frame().size.height
	}

	fn main_window(window: &WebviewWindow) -> Option<Retained<NSWindow>> {
		let handle = window.ns_window().ok()?;
		unsafe { Retained::retain(handle.cast::<NSWindow>()) }
	}

	fn window_buttons(ns_window: &NSWindow) -> Option<[Retained<NSButton>; 3]> {
		Some([
			ns_window.standardWindowButton(NSWindowButton::CloseButton)?,
			ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton)?,
			ns_window.standardWindowButton(NSWindowButton::ZoomButton)?,
		])
	}

	fn titlebar_of(control: &NSButton) -> Option<Retained<NSView>> {
		unsafe { control.superview()?.superview() }
	}
}
