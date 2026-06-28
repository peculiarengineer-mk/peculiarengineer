import { getCollection } from 'astro:content';
import { sortByPubDate } from '../consts';

// Build-time search index: one JSON doc the client-side command prompt fetches.
export async function GET() {
	const posts = await getCollection('blog');
	const index = posts
		.sort(sortByPubDate)
		.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			slug: post.id,
			date: post.data.pubDate.toISOString(),
			// Strip Markdown punctuation so keyword matching hits the prose, not the syntax.
			body: (post.body ?? '')
				.replace(/[#>*`_~\-\[\]()!|]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 500),
		}));

	return new Response(JSON.stringify(index), {
		headers: { 'Content-Type': 'application/json' },
	});
}
