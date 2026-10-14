import request from 'supertest';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { prisma } from '../../src/db.js';
import { bearer, chatBody, describeDb, makeApp, parseSse, registerUser, resetDatabase, setPrivacy } from './helpers.js';

describeDb("one user cannot reach another user's data", () => {
  let app = makeApp();
  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
  });
  afterAll(() => prisma.$disconnect());

  it('memories and conversations are invisible and untouchable across accounts', async () => {
    const alice = await registerUser(app, 'Alice');
    const bina = await registerUser(app, 'Bina');
    await setPrivacy(app, alice, { memoryMode: 'PERSONAL', historyEnabled: true }).expect(200);
    await setPrivacy(app, bina, { memoryMode: 'PERSONAL', historyEnabled: true }).expect(200);

    const memory = await request(app)
      .post('/api/memories')
      .set(bearer(alice.token))
      .send({ content: 'You like filter coffee in the morning', category: 'PREFERENCE' })
      .expect(201);
    const memoryId = memory.body.memory.id as string;

    const chat = await request(app).post('/api/chat/stream').set(bearer(alice.token)).send(chatBody('hello'));
    const conversationId = parseSse(chat.text).find((e) => e.event === 'done')!.data.conversationId as string;
    expect(conversationId).toEqual(expect.any(String));

    // Bina's lists never include Alice's data.
    expect((await request(app).get('/api/memories').set(bearer(bina.token))).body.memories).toEqual([]);
    expect((await request(app).get('/api/conversations').set(bearer(bina.token))).body.conversations).toEqual([]);

    // Direct access by id is indistinguishable from "does not exist".
    await request(app).get(`/api/conversations/${conversationId}`).set(bearer(bina.token)).expect(404);
    await request(app).delete(`/api/conversations/${conversationId}`).set(bearer(bina.token)).expect(404);
    await request(app).patch(`/api/memories/${memoryId}`).set(bearer(bina.token)).send({ content: 'hacked' }).expect(404);
    await request(app).delete(`/api/memories/${memoryId}`).set(bearer(bina.token)).expect(404);

    // Bina cannot append to Alice's conversation by passing its id.
    const hijack = await request(app)
      .post('/api/chat/stream')
      .set(bearer(bina.token))
      .send(chatBody('let me in', { conversationId }));
    const binaConversation = parseSse(hijack.text).find((e) => e.event === 'done')!.data.conversationId;
    expect(binaConversation).not.toBe(conversationId);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(2);

    // Bulk deletes are scoped too.
    await request(app).delete('/api/memories').set(bearer(bina.token)).expect(200);
    await request(app).delete('/api/conversations').set(bearer(bina.token)).expect(200);
    expect(await prisma.memory.findUnique({ where: { id: memoryId } })).not.toBeNull();
    expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).not.toBeNull();
    expect((await prisma.memory.findUniqueOrThrow({ where: { id: memoryId } })).content).toBe(
      'You like filter coffee in the morning',
    );
  });
});
