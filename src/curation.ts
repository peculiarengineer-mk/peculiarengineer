// Curated lists behind the topic pages, the archive chips, the tag links on
// every post and the homepage sections. Slugs reference entries in
// src/content/blog; a missing one throws at build time instead of shipping a
// broken link.
import type { CollectionEntry } from 'astro:content';
import { sortByPubDate } from './consts';

type Post = CollectionEntry<'blog'>;

// Topics for the back catalogue. `tags` lists the post tags that belong to a
// topic; matching is case insensitive.
export const TOPICS: { slug: string; label: string; blurb: string; tags: string[] }[] = [
	{
		slug: 'ubuntu',
		label: 'Ubuntu',
		blurb: 'Install, upgrade and troubleshoot Ubuntu on servers and desktops.',
		tags: ['Ubuntu', 'Ubuntu2604', 'Ubuntu2610', 'Ubuntu2404'],
	},
	{
		slug: 'docker',
		label: 'Docker',
		blurb: 'Run containers with Docker, Compose and Podman.',
		tags: ['Docker', 'DockerCompose', 'Podman', 'Containers'],
	},
	{
		slug: 'ssh',
		label: 'SSH',
		blurb: 'Keys, configs and fixes for getting into remote machines.',
		tags: ['SSH', 'OpenSSH'],
	},
	{
		slug: 'security',
		label: 'Security',
		blurb: 'Hardening, firewalls and intrusion blocking for Linux servers.',
		tags: ['Security', 'Hardening', 'Firewall', 'UFW', 'fail2ban', 'CrowdSec', 'Firewalld'],
	},
	{
		slug: 'self-hosting',
		label: 'Self-hosting',
		blurb: 'Host your own media, backups and services at home.',
		tags: ['SelfHosted', 'Homelab', 'MediaServer'],
	},
	{
		slug: 'ai',
		label: 'AI',
		blurb: 'Local models, MCP servers and AI coding tools.',
		tags: ['AI', 'LLM', 'ClaudeCode', 'MCP', 'Ollama'],
	},
	{
		slug: 'kubernetes',
		label: 'Kubernetes',
		blurb: 'Cluster basics with k3s, ArgoCD and GitOps.',
		tags: ['Kubernetes', 'k3s'],
	},
];

// Topics matching any of the given post tags (case insensitive).
export function topicsForTags(tags: string[] | undefined): typeof TOPICS {
	if (!tags || tags.length === 0) return [];
	const lower = tags.map((tag) => tag.toLowerCase());
	return TOPICS.filter((topic) => topic.tags.some((tag) => lower.includes(tag.toLowerCase())));
}

// Every post in a topic, newest first.
export function postsForTopic(posts: Post[], slug: string): Post[] {
	if (!TOPICS.some((topic) => topic.slug === slug)) {
		throw new Error(`curation: unknown topic slug ${slug}`);
	}
	return posts
		.filter((post) => topicsForTags(post.data.tags).some((topic) => topic.slug === slug))
		.sort(sortByPubDate);
}

// Curated learning paths: an ordered list of post slugs from start to finish.
export const PATHS: { slug: string; title: string; blurb: string; posts: string[] }[] = [
	{
		slug: 'secure-ubuntu-server',
		title: 'Secure a new Ubuntu server',
		blurb: 'Take a fresh Ubuntu box from first login to locked down.',
		posts: [
			'create-sudo-user-ubuntu-26-04',
			'set-up-ssh-keys-ubuntu',
			'ufw-firewall-basics-ubuntu',
			'hardening-ubuntu-26-04-server',
			'set-up-fail2ban-ubuntu-26-04',
			'crowdsec-nginx-bouncer-ubuntu-26-04',
		],
	},
	{
		slug: 'docker-on-ubuntu',
		title: 'Docker on Ubuntu',
		blurb: 'Get containers running on Ubuntu and keep them backed up.',
		posts: [
			'install-docker-ubuntu-26-04',
			'docker-permission-denied-docker-api-ubuntu-26-04',
			'caddy-reverse-proxy-docker-compose-ubuntu-26-04',
			'install-portainer-ubuntu-26-04',
			'backup-homelab-restic-object-storage',
		],
	},
	{
		slug: 'fix-ssh',
		title: 'Fix SSH problems',
		blurb: 'Diagnose and repair the SSH problems everyone hits.',
		posts: [
			'ssh-connection-refused-port-22-ubuntu',
			'permission-denied-publickey-ubuntu',
			'set-up-ssh-keys-ubuntu',
			'ssh-config-file-explained',
			'enable-ssh-on-ubuntu-desktop',
		],
	},
];

// The fixes most people arrive looking for.
export const POPULAR: string[] = [
	'permission-denied-publickey-ubuntu',
	'ssh-connection-refused-port-22-ubuntu',
	'pip-externally-managed-environment-ubuntu-26-04',
	'docker-permission-denied-docker-api-ubuntu-26-04',
	'journald-disk-usage-retention-ubuntu-26-04',
	'missing-ctypes-rebuild-python-libffi',
];

// Longer explorations for when you want the whole story.
export const DEEP_DIVES: string[] = [
	'kubernetes-sealed-secrets-gitops-argocd',
	'sudo-rs-vs-gnu-sudo-ubuntu-26-04',
	'ubuntu-26-10-server-what-changed',
	'mcp-server-search-ranking-embeddings-ollama',
	'llama-cpp-server-ubuntu-26-04-cpu-mlock',
	'resurrecting-dead-book-downloader-api-migration',
];

// Posts by slug, kept in the given order. Throws on a slug that does not exist
// so a typo fails the build instead of shipping a broken link.
export function resolveSlugs(posts: Post[], slugs: string[]): Post[] {
	return slugs.map((slug) => {
		const post = posts.find((entry) => entry.id === slug);
		if (!post) throw new Error(`curation: unknown post slug ${slug}`);
		return post;
	});
}
