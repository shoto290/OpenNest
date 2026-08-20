/** The `_many` counterpart a language owes every key English counts with `_one`.
 * English plurals stop at one and other, French adds many, so a counted key
 * translated without it would render its own name at a reader. */
type ManyForms<Shape> = {
	[Key in keyof Shape]: Key extends `${infer Stem}_one` ? `${Stem}_many` : never
}[keyof Shape]

/** The shape a translated catalogue owes the one it mirrors: every namespace and
 * every key it holds, nested as deeply, plus the plural forms the language takes.
 * A key the mirror drops fails the type check rather than falling back at a
 * reader. */
export type Catalogue<Shape> = {
	[Key in keyof Shape]: Shape[Key] extends string
		? string
		: Catalogue<Shape[Key]>
} & { [Key in ManyForms<Shape>]: string }
