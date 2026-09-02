use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FieldType {
	String,
	Number,
	Boolean,
	Datetime,
}

impl FieldType {
	pub const ALL: [FieldType; 4] =
		[FieldType::String, FieldType::Number, FieldType::Boolean, FieldType::Datetime];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
	Exists,
	NotExists,
	Equals,
	NotEquals,
	Contains,
	NotContains,
	StartsWith,
	EndsWith,
	Gt,
	Lt,
}

impl FilterOperator {
	pub const ALL: [FilterOperator; 10] = [
		FilterOperator::Exists,
		FilterOperator::NotExists,
		FilterOperator::Equals,
		FilterOperator::NotEquals,
		FilterOperator::Contains,
		FilterOperator::NotContains,
		FilterOperator::StartsWith,
		FilterOperator::EndsWith,
		FilterOperator::Gt,
		FilterOperator::Lt,
	];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FilterMatchMode {
	All,
	Any,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterRow {
	pub field: String,
	pub operator: FilterOperator,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
	pub match_mode: FilterMatchMode,
	pub rows: Vec<FilterRow>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayloadField {
	pub name: String,
	#[serde(rename = "type")]
	pub field_type: FieldType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerSource {
	pub id: String,
	pub title: String,
	pub payload: Vec<PayloadField>,
	pub dedupe_key: String,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub header: Option<String>,
}

#[cfg(test)]
mod tests {
	use std::collections::BTreeSet;
	use std::path::PathBuf;

	use serde_json::{json, to_value};

	use super::*;

	fn vocabulary() -> serde_json::Value {
		let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
			.join("..")
			.join("shared")
			.join("filter-vocabulary.json");
		let text = std::fs::read_to_string(&path).expect("the vocabulary reads");
		serde_json::from_str(&text).expect("the vocabulary is JSON")
	}

	fn named<T: Serialize>(values: &[T]) -> BTreeSet<String> {
		values
			.iter()
			.map(|value| {
				to_value(value)
					.expect("the value serialises")
					.as_str()
					.expect("it is a name")
					.to_owned()
			})
			.collect()
	}

	fn listed(value: &serde_json::Value) -> BTreeSet<String> {
		value
			.as_array()
			.expect("the entry is a list")
			.iter()
			.map(|name| name.as_str().expect("the name is a string").to_owned())
			.collect()
	}

	#[test]
	fn the_field_types_are_the_ones_the_shared_vocabulary_holds() {
		let vocabulary = vocabulary();

		assert_eq!(named(&FieldType::ALL), listed(&vocabulary["fieldTypes"]));
	}

	#[test]
	fn every_field_type_carries_the_operators_the_shared_vocabulary_gives_it() {
		let vocabulary = vocabulary();
		let table = vocabulary["operatorsByFieldType"].as_object().expect("the table is an object");

		assert_eq!(
			named(&FieldType::ALL),
			table.keys().cloned().collect::<BTreeSet<_>>(),
			"the table covers every field type"
		);
		let accepted: BTreeSet<String> = table.values().flat_map(listed).collect();
		assert_eq!(named(&FilterOperator::ALL), accepted);
	}

	#[test]
	fn a_filter_is_a_match_mode_and_a_flat_list_of_rows() {
		let filter = Filter {
			match_mode: FilterMatchMode::Any,
			rows: vec![
				FilterRow {
					field: "issue.labels.name".to_owned(),
					operator: FilterOperator::Equals,
					value: Some(json!("bug")),
				},
				FilterRow {
					field: "issue.closedAt".to_owned(),
					operator: FilterOperator::Exists,
					value: None,
				},
			],
		};

		assert_eq!(
			to_value(&filter).expect("the filter serialises"),
			json!({
				"matchMode": "any",
				"rows": [
					{ "field": "issue.labels.name", "operator": "equals", "value": "bug" },
					{ "field": "issue.closedAt", "operator": "exists" },
				],
			})
		);
	}
}
