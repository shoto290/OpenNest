use serde::Deserialize;

use super::contract::{Application, ApplicationsError, Install};
use crate::bundles::system;

#[derive(Deserialize)]
struct Curated {
	name: String,
	title: String,
	description: String,
	config: serde_json::Value,
	tools: Vec<String>,
	#[serde(default)]
	logo: Option<String>,
	install: Install,
}

pub fn curated() -> Result<Vec<Application>, ApplicationsError> {
	let bytes = embedded(system::APPLICATIONS)?;
	let entries: Vec<Curated> = serde_json::from_slice(bytes).map_err(|error| {
		unreadable(format!("{} is not a catalogue: {error}", system::APPLICATIONS))
	})?;
	entries.into_iter().map(application).collect()
}

fn application(entry: Curated) -> Result<Application, ApplicationsError> {
	let logo = entry.logo.as_deref().map(logo).transpose()?;
	Ok(Application {
		name: entry.name,
		title: entry.title,
		description: entry.description,
		config: entry.config,
		tools: entry.tools,
		logo,
		install: entry.install,
	})
}

fn logo(path: &str) -> Result<String, ApplicationsError> {
	String::from_utf8(embedded(path)?.to_vec())
		.map_err(|error| unreadable(format!("the logo {path} is not text: {error}")))
}

fn embedded(path: &str) -> Result<&'static [u8], ApplicationsError> {
	system::file(path).ok_or_else(|| unreadable(format!("{path} is not embedded")))
}

fn unreadable(detail: String) -> ApplicationsError {
	ApplicationsError::CatalogueUnreadable { detail }
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;

	use serde_json::json;

	use super::*;

	fn the_catalogue() -> Vec<Application> {
		curated().expect("the embedded catalogue reads")
	}

	fn entry(name: &str) -> Application {
		the_catalogue()
			.into_iter()
			.find(|held| held.name == name)
			.unwrap_or_else(|| panic!("{name} is curated"))
	}

	fn icons() -> String {
		let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
			.join("../../../packages/ui/src/components/icons.tsx");
		std::fs::read_to_string(path).expect("the icons read")
	}

	fn drawn_paths(svg: &str) -> Vec<&str> {
		svg.split("d=\"").skip(1).filter_map(|rest| rest.split('"').next()).collect()
	}

	#[test]
	fn seven_applications_are_curated_in_order() {
		let names: Vec<String> = the_catalogue().into_iter().map(|held| held.name).collect();

		assert_eq!(names, ["github", "linear", "notion", "granola", "sentry", "superset", "paper"]);
	}

	#[test]
	fn every_application_carries_a_title_a_one_line_description_a_config_and_its_tools() {
		for application in the_catalogue() {
			let name = &application.name;
			assert!(!application.title.is_empty(), "{name} has no title");
			assert!(!application.description.is_empty(), "{name} has no description");
			assert!(!application.description.contains('\n'), "{name} spans lines");
			assert_eq!(application.config["type"], "http", "got {name}");
			assert!(application.config["url"].is_string(), "{name} has no url");
			assert!(!application.tools.is_empty(), "{name} names no tool");
		}
	}

	#[test]
	fn each_application_answers_its_install_case() {
		for name in ["github", "linear", "notion", "granola", "sentry"] {
			assert_eq!(entry(name).install, Install::Oauth, "got {name}");
		}
		assert!(matches!(entry("superset").install, Install::Key { .. }));
		assert_eq!(entry("paper").install, Install::Nothing);
	}

	#[test]
	fn superset_asks_for_its_api_key_as_a_bearer_placeholder() {
		let superset = entry("superset");

		assert_eq!(
			superset.config["headers"],
			json!({ "Authorization": "Bearer ${SUPERSET_API_KEY}" })
		);
		let Install::Key { secret, .. } = superset.install else {
			panic!("superset asks for a key");
		};
		assert_eq!(secret, "SUPERSET_API_KEY");
	}

	#[test]
	fn an_oauth_application_carries_no_header_of_its_own() {
		for application in the_catalogue().into_iter().filter(|held| held.install == Install::Oauth)
		{
			assert!(application.config.get("headers").is_none(), "got {}", application.name);
		}
	}

	#[test]
	fn the_logos_are_the_marks_of_the_design_system_and_the_rest_have_none() {
		let icons = icons();

		for name in ["github", "linear", "superset", "paper"] {
			let logo = entry(name).logo.unwrap_or_else(|| panic!("{name} has a logo"));
			assert!(logo.starts_with("<svg"), "got {logo}");
			let paths = drawn_paths(&logo);
			assert!(!paths.is_empty(), "{name} draws nothing");
			for path in paths {
				assert!(icons.contains(path), "the {name} logo is not a mark of the design system");
			}
		}
		for name in ["notion", "granola", "sentry"] {
			assert_eq!(entry(name).logo, None, "got {name}");
		}
	}
}
