type ManyForms<Shape> = {
	[Key in keyof Shape]: Key extends `${infer Stem}_one` ? `${Stem}_many` : never
}[keyof Shape]

export type Catalogue<Shape> = {
	[Key in keyof Shape]: Shape[Key] extends string
		? string
		: Catalogue<Shape[Key]>
} & { [Key in ManyForms<Shape>]: string }
