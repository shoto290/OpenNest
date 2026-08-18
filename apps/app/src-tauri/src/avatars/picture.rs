//! Turns whatever bytes a user picked into the one shape an avatar is stored in.
//!
//! Every check here happens before anything reaches the disk, and the whole
//! transformation happens in memory: a refusal is a value returned, not a file to
//! take back. That is what makes "a rejected picture leaves no trace" a property of
//! the order these steps run in rather than a cleanup somebody has to remember.
//!
//! The format is read off the leading bytes and never off a name or a declared
//! type. Both of those are the caller's word, and the caller is a webview handed a
//! file by a user — `holiday.png` renaming a video is not a hostile act, it is
//! Tuesday. Sniffing is also what keeps the decoder from ever meeting bytes this
//! build has no decoder for: the format is decided here and handed over, so
//! `image` is never asked to guess.
//!
//! The output is one format, one size, one aspect: 512×512 PNG. A single shape is
//! what lets every avatar render identically without the UI knowing anything about
//! what was uploaded, and it is the whole reason a 12-megapixel photograph does not
//! sit in the app directory for the life of the install. PNG rather than JPEG
//! because an avatar may be transparent and a quality knob is a decision nobody
//! here is equipped to make; the size is bounded either way.

use std::io::Cursor;

use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader, Limits};

/// What a stored avatar measures, on both sides. The picture is square by the time
/// it is resized, so one number is the whole geometry.
const SIDE: u32 = 512;

/// The largest upload accepted, counted on the bytes as they arrived. Checked
/// before the decoder is built: the point of a limit is to not do the work. It
/// leaves this module only inside a [`Rejection::TooLarge`], which is how the
/// frontend learns it without holding a second copy of the number.
const MAX_BYTES: u64 = 5 * 1024 * 1024;

/// What the decoder is allowed to allocate for one picture. A few megabytes of
/// PNG can describe a gigapixel canvas, so the input limit above bounds the file
/// and this one bounds what unpacking it costs.
const MAX_DECODED_BYTES: u64 = 256 * 1024 * 1024;

/// Enough bytes for the longest signature below to be decided. Shorter input is
/// not an unknown format, it is not a picture at all, and both are refused the
/// same way.
const SIGNATURE_LENGTH: usize = 12;

const PNG_SIGNATURE: &[u8] = &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE: &[u8] = &[0xff, 0xd8, 0xff];
const RIFF_SIGNATURE: &[u8] = b"RIFF";
const WEBP_SIGNATURE: &[u8] = b"WEBP";

/// Why a picture was not stored. Every variant is the user's to act on — a wrong
/// file, a file too big, or bytes that lied about being a picture — which is why
/// none of them is folded into a storage failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rejection {
	/// The leading bytes are none of the three formats this build decodes.
	UnknownFormat,
	TooLarge {
		bytes: u64,
		limit: u64,
	},
	/// The signature was one of the three and the bytes behind it did not decode.
	Undecodable {
		detail: String,
	},
	/// The picture was accepted and the disk refused it, or there was nowhere to
	/// put it. Not the user's fault and not a rule — but it is still why no avatar
	/// was stored, so it answers on the same channel.
	Unwritable {
		detail: String,
	},
}

/// The bytes an avatar is stored as: sniffed, bounded, decoded, squared, resized
/// and re-encoded. Nothing on the way through touches the filesystem, so a
/// caller may run this before it has decided where the file goes — or whether
/// there is going to be one at all.
pub fn normalised(bytes: &[u8]) -> Result<Vec<u8>, Rejection> {
	let length = bytes.len() as u64;
	if length > MAX_BYTES {
		return Err(Rejection::TooLarge { bytes: length, limit: MAX_BYTES });
	}
	let sniffed = sniff(bytes).ok_or(Rejection::UnknownFormat)?;
	let decoded = decode(bytes, sniffed)?;
	encode(squared(&decoded))
}

/// The format the leading bytes say it is, and the only three this can ever answer:
/// they are the three the `image` dependency is compiled with, so a format nothing
/// here decodes cannot be named, let alone reached.
///
/// WebP takes two windows because RIFF is a container: `RIFF....WEBP` is the only one
/// of its payloads this accepts, and checking only the `RIFF` half would hand a WAV
/// file to an image decoder.
fn sniff(bytes: &[u8]) -> Option<ImageFormat> {
	let head = bytes.get(..SIGNATURE_LENGTH)?;
	if head.starts_with(PNG_SIGNATURE) {
		return Some(ImageFormat::Png);
	}
	if head.starts_with(JPEG_SIGNATURE) {
		return Some(ImageFormat::Jpeg);
	}
	if head.starts_with(RIFF_SIGNATURE) && &head[8..12] == WEBP_SIGNATURE {
		return Some(ImageFormat::WebP);
	}
	None
}

/// The format is handed over rather than guessed, and the limits are set before
/// the first allocation: a decoder that is told what it is reading cannot be
/// talked into another format by the bytes it reads.
fn decode(bytes: &[u8], sniffed: ImageFormat) -> Result<DynamicImage, Rejection> {
	let mut limits = Limits::no_limits();
	limits.max_alloc = Some(MAX_DECODED_BYTES);
	let mut reader = ImageReader::with_format(Cursor::new(bytes), sniffed);
	reader.limits(limits);
	reader.decode().map_err(|error| Rejection::Undecodable { detail: error.to_string() })
}

/// Centre-cropped to a square, then resized to [`SIDE`] exactly. The crop comes
/// first so the resize never has to stretch: what is dropped is the long edge's
/// margins, evenly, which is what keeps a face where the user left it.
///
/// Smaller than [`SIDE`] is upscaled rather than left alone. One stored size is
/// the point — the UI draws every avatar at the same measurements, and a branch
/// here would only move the guesswork over there.
fn squared(decoded: &DynamicImage) -> DynamicImage {
	let (width, height) = decoded.dimensions();
	let side = width.min(height);
	let cropped = decoded.crop_imm((width - side) / 2, (height - side) / 2, side, side);
	cropped.resize_exact(SIDE, SIDE, FilterType::Lanczos3)
}

fn encode(picture: DynamicImage) -> Result<Vec<u8>, Rejection> {
	let mut encoded = Cursor::new(Vec::new());
	picture
		.write_to(&mut encoded, ImageFormat::Png)
		.map_err(|error| Rejection::Undecodable { detail: error.to_string() })?;
	Ok(encoded.into_inner())
}

#[cfg(test)]
pub(crate) mod fixtures {
	use super::*;

	/// A picture built rather than checked in: the tests assert on what comes out
	/// the far side, and bytes generated here cannot drift from the decoder that
	/// has to read them.
	pub fn a_picture(width: u32, height: u32, format: ImageFormat) -> Vec<u8> {
		let mut canvas = image::RgbImage::new(width, height);
		for (x, y, pixel) in canvas.enumerate_pixels_mut() {
			*pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 128]);
		}
		let mut encoded = Cursor::new(Vec::new());
		DynamicImage::ImageRgb8(canvas)
			.write_to(&mut encoded, format)
			.expect("the fixture encodes");
		encoded.into_inner()
	}

	pub fn a_png(width: u32, height: u32) -> Vec<u8> {
		a_picture(width, height, ImageFormat::Png)
	}
}

#[cfg(test)]
mod tests {
	use super::fixtures::{a_picture, a_png};
	use super::*;

	fn dimensions_of(bytes: &[u8]) -> (u32, u32) {
		image::load_from_memory_with_format(bytes, ImageFormat::Png)
			.expect("the stored bytes decode as png")
			.dimensions()
	}

	#[test]
	fn the_three_accepted_formats_all_come_out_as_one() {
		for format in [ImageFormat::Png, ImageFormat::Jpeg] {
			let stored = normalised(&a_picture(40, 40, format)).expect("the picture is accepted");

			assert_eq!(
				image::guess_format(&stored).expect("a format"),
				ImageFormat::Png,
				"{format:?} was stored as something the UI would have to tell apart"
			);
		}
	}

	/// WebP is encoded by nothing in this build, so its acceptance is proven on the
	/// signature and the decode rather than on a round trip.
	#[test]
	fn a_webp_signature_reaches_the_decoder() {
		let mut bytes = Vec::from(RIFF_SIGNATURE);
		bytes.extend_from_slice(&[0, 0, 0, 0]);
		bytes.extend_from_slice(WEBP_SIGNATURE);

		assert_eq!(sniff(&bytes), Some(ImageFormat::WebP));
		assert!(
			matches!(normalised(&bytes), Err(Rejection::Undecodable { .. })),
			"a truncated webp was refused as something other than undecodable"
		);
	}

	#[test]
	fn a_wide_picture_is_centre_cropped_to_a_square_of_one_size() {
		let stored = normalised(&a_png(200, 80)).expect("the picture is accepted");

		assert_eq!(dimensions_of(&stored), (SIDE, SIDE));
	}

	#[test]
	fn a_tall_picture_is_centre_cropped_to_the_same_square() {
		let stored = normalised(&a_png(80, 200)).expect("the picture is accepted");

		assert_eq!(dimensions_of(&stored), (SIDE, SIDE));
	}

	/// The crop is what makes this hold: a stretch would have kept every column and
	/// squeezed them, so the surviving band is asserted rather than the size alone.
	#[test]
	fn the_square_taken_out_of_a_wide_picture_is_its_middle() {
		let stored = normalised(&a_png(300, 100)).expect("the picture is accepted");
		let source = image::load_from_memory_with_format(&a_png(300, 100), ImageFormat::Png)
			.expect("the fixture decodes");
		let expected =
			source.crop_imm(100, 0, 100, 100).resize_exact(SIDE, SIDE, FilterType::Lanczos3);

		assert_eq!(stored, encode(expected).expect("the expectation encodes"));
	}

	#[test]
	fn a_picture_smaller_than_the_stored_size_is_still_stored_at_it() {
		let stored = normalised(&a_png(16, 16)).expect("the picture is accepted");

		assert_eq!(dimensions_of(&stored), (SIDE, SIDE));
	}

	#[test]
	fn a_format_this_build_does_not_decode_is_refused_on_its_bytes() {
		assert_eq!(normalised(b"GIF89a\0\0\0\0\0\0"), Err(Rejection::UnknownFormat));
	}

	/// The whole reason the signature is read instead of a name: the extension and
	/// the content type both said png, and the bytes are the only witness.
	#[test]
	fn bytes_that_are_not_a_picture_are_refused_however_they_were_labelled() {
		let refused = normalised(b"#!/bin/sh\nrm -rf /\n");

		assert_eq!(refused, Err(Rejection::UnknownFormat));
	}

	#[test]
	fn a_picture_shorter_than_a_signature_is_refused_rather_than_decoded() {
		assert_eq!(normalised(&PNG_SIGNATURE[..4]), Err(Rejection::UnknownFormat));
		assert_eq!(normalised(&[]), Err(Rejection::UnknownFormat));
	}

	/// The size is refused on the bytes as they arrived, before the format is even
	/// looked at: an oversized picture must not be decoded to find out it is one.
	#[test]
	fn anything_over_the_limit_is_refused_before_it_is_sniffed() {
		let oversized = vec![0u8; (MAX_BYTES + 1) as usize];

		assert_eq!(
			normalised(&oversized),
			Err(Rejection::TooLarge { bytes: MAX_BYTES + 1, limit: MAX_BYTES })
		);
	}

	#[test]
	fn a_picture_right_on_the_limit_is_accepted() {
		let mut padded = a_png(8, 8);
		assert!(padded.len() as u64 <= MAX_BYTES, "the fixture is already over the limit");
		padded.resize(MAX_BYTES as usize, 0);

		assert!(normalised(&padded).is_ok(), "the boundary itself was refused");
	}

	/// A real png header with nothing behind it: the signature passes and the
	/// decoder is the one that says no, which is a different refusal on purpose.
	#[test]
	fn a_truncated_picture_of_an_accepted_format_is_refused_by_the_decoder() {
		let truncated = &a_png(40, 40)[..20];

		assert!(
			matches!(normalised(truncated), Err(Rejection::Undecodable { .. })),
			"truncated bytes were not refused as undecodable"
		);
	}
}
