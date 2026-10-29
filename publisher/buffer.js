// Client minimal de l'API Buffer (GraphQL, https://api.buffer.com) : Buffer publie ensuite tout seul sur TikTok
// aux heures du « Posting schedule » réglé dans Buffer. Doc : https://developers.buffer.com
const API = process.env.BUFFER_API_BASE || 'https://api.buffer.com';

export async function gql(key, query, variables = {}) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, variables }) });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`Buffer a répondu ${r.status} : ${txt.slice(0, 200)}`); }
  if (r.status === 401 || r.status === 403) throw new Error('Clé API Buffer refusée : recrée-la sur https://publish.buffer.com/settings/api et remets-la dans le secret GitHub BUFFER_API_KEY.');
  if (j.errors?.length) throw new Error('Buffer : ' + j.errors.map((e) => e.message).join(' ; '));
  return j.data;
}

export async function organizationId(key) {
  const d = await gql(key, 'query { account { organizations { id } } }');
  const id = d?.account?.organizations?.[0]?.id;
  if (!id) throw new Error('Aucune organisation Buffer trouvée sur ce compte.');
  return id;
}

export async function channels(key, orgId) {
  const d = await gql(key, 'query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id name displayName service isQueuePaused } }', { o: orgId })
    .catch(() => gql(key, `query { channels(input: { organizationId: "${orgId}" }) { id name displayName service isQueuePaused } }`));
  return d.channels || [];
}

/** Chaîne TikTok du compte (la première, ou celle dont le nom contient `nom`). */
export async function tiktokChannel(key, orgId, nom) {
  const list = (await channels(key, orgId)).filter((c) => /tiktok/i.test(c.service));
  if (!list.length) throw new Error("Aucune chaîne TikTok connectée dans Buffer (Buffer → « Connect channel » → TikTok).");
  return list.find((c) => nom && `${c.name} ${c.displayName}`.toLowerCase().includes(nom.toLowerCase())) || list[0];
}

/** Posts programmés (pas encore publiés) de la chaîne. */
export async function scheduled(key, orgId, channelId) {
  const q = (withChannel) => `query { posts(input: { organizationId: "${orgId}", sort: [{ field: dueAt, direction: asc }], filter: { status: [scheduled]${withChannel ? `, channelIds: ["${channelId}"]` : ''} } }) { edges { node { id text ${withChannel ? '' : 'channelId'} } } } }`;
  let d;
  try { d = await gql(key, q(true)); } catch { d = await gql(key, q(false)); }
  return (d.posts?.edges || []).map((e) => e.node).filter((n) => !n.channelId || n.channelId === channelId);
}

/** Ajoute une vidéo à la file Buffer (publiée au prochain créneau libre). */
export async function queueVideo(key, { channelId, text, url, thumbMs = 1000 }) {
  const query = `mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }`;
  const input = { text, channelId, schedulingType: 'automatic', mode: 'addToQueue', assets: [{ video: { url, metadata: { thumbnailOffset: thumbMs } } }] };
  let d;
  try { d = await gql(key, query, { input }); } catch (e) {
    if (!/type|variable/i.test(e.message)) throw e; // nom du type d'entrée différent : on écrit l'entrée en clair
    const lit = `{ text: ${JSON.stringify(text)}, channelId: ${JSON.stringify(channelId)}, schedulingType: automatic, mode: addToQueue, assets: [{ video: { url: ${JSON.stringify(url)}, metadata: { thumbnailOffset: ${thumbMs} } } }] }`;
    d = await gql(key, `mutation { createPost(input: ${lit}) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }`);
  }
  const res = d.createPost || {};
  if (!res.post?.id) throw new Error('Buffer a refusé la vidéo : ' + (res.message || JSON.stringify(res).slice(0, 200)));
  return res.post.id;
}

/** Retire un post de la file Buffer (essaie les deux formes connues de la mutation). */
export async function deletePost(key, id) {
  const tries = [
    `mutation { deletePost(input: { id: ${JSON.stringify(id)} }) { __typename ... on MutationError { message } } }`,
    `mutation { deletePost(input: { postId: ${JSON.stringify(id)} }) { __typename ... on MutationError { message } } }`,
    `mutation { deletePost(id: ${JSON.stringify(id)}) { __typename } }`,
  ];
  let last;
  for (const q of tries) {
    try { const d = await gql(key, q); if (d?.deletePost?.message) throw new Error(d.deletePost.message); return true; } catch (e) { last = e; }
  }
  throw last;
}
