// Wrap every <table> in a horizontally scrollable div. Markdown tables are
// emitted bare, and a table with code in its cells cannot shrink below its
// content width, so on a phone it pushes the whole page sideways. Scrolling
// the wrapper instead keeps the page itself at viewport width.
export default function rehypeTableWrap() {
	return (tree) => {
		const walk = (node) => {
			if (!node.children) return;
			node.children = node.children.map((child) => {
				if (child.type === 'element' && child.tagName === 'table') {
					return {
						type: 'element',
						tagName: 'div',
						properties: { className: ['table-wrap'] },
						children: [child],
					};
				}
				walk(child);
				return child;
			});
		};
		walk(tree);
	};
}
