const ITEMS = Array.from({ length: 12 }, (_, index) => index + 1)

export const ScrollbarPreview = () => (
	<div className="flex flex-col gap-6">
		<div className="h-56 max-w-md overflow-y-auto rounded-lg border border-border bg-card p-4">
			<div className="flex flex-col gap-3">
				{ITEMS.map((item) => (
					<div key={item} className="rounded-md bg-secondary px-3 py-2">
						<code className="font-mono text-muted-foreground text-xs">
							row {item}
						</code>
					</div>
				))}
			</div>
		</div>
		<div className="max-w-md overflow-x-auto rounded-lg border border-border bg-card p-4">
			<div className="flex w-max gap-3">
				{ITEMS.map((item) => (
					<div key={item} className="rounded-md bg-secondary px-6 py-8">
						<code className="font-mono text-muted-foreground text-xs">
							col {item}
						</code>
					</div>
				))}
			</div>
		</div>
	</div>
)
