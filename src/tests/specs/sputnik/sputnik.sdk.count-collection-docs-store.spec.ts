import type { _SERVICE as SputnikActor } from '$declarations/sputnik/sputnik.did';
import type { Identity } from '@dfinity/agent';
import type { Actor, PocketIc } from '@dfinity/pic';
import type { Principal } from '@dfinity/principal';
import { toNullable } from '@dfinity/utils';
import { nanoid } from 'nanoid';
import { mockSetRule } from '../../mocks/collection.mocks';
import { setupTestSputnik } from '../../utils/fixtures-tests.utils';
import { fetchLogs } from '../../utils/mgmt-tests.utils';
import { waitServerlessFunction } from '../../utils/satellite-extended-tests.utils';
import { addSomeDocsToBeListed } from '../../utils/sputnik-tests.utils';

describe('Sputnik > sdk > countCollectionDocsStore', () => {
	let pic: PocketIc;
	let actor: Actor<SputnikActor>;
	let canisterId: Principal;
	let controller: Identity;

	const TEST_COLLECTION = 'test-countcollectiondocs';
	const MOCK_COLLECTION = 'demo-countcollectiondocs';

	let keys: string[];

	beforeAll(async () => {
		const { pic: p, actor: a, controller: c, canisterId: cId } = await setupTestSputnik();

		pic = p;
		actor = a;
		controller = c;
		canisterId = cId;

		const { set_rule } = actor;
		await set_rule({ Db: null }, TEST_COLLECTION, mockSetRule);
		await set_rule({ Db: null }, MOCK_COLLECTION, {
			...mockSetRule,
			read: { Public: null },
			write: { Public: null }
		});

		keys = await addSomeDocsToBeListed({
			collection: MOCK_COLLECTION,
			actor,
			controller,
			pic
		});
	});

	afterAll(async () => {
		await pic?.tearDown();
	});

	const setDoc = async (): Promise<void> => {
		const { set_doc } = actor;

		const key = nanoid();

		await set_doc(TEST_COLLECTION, key, {
			data: [],
			description: toNullable(),
			version: toNullable()
		});

		await waitServerlessFunction(pic);
	};

	it('should count documents', async () => {
		await setDoc();

		const logs = await fetchLogs({
			canisterId,
			controller,
			pic
		});

		const countMsg = logs.find(([_, { message }]) => message.includes('Count:'));

		expect(countMsg).not.toBeUndefined();

		const count = BigInt((countMsg?.[1].message ?? '').replace('Count:', '').trim());

		expect(count).toEqual(BigInt(keys.length));
	});
});
