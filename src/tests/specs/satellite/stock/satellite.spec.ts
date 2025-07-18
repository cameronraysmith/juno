import type { _SERVICE as SatelliteActor, SetRule } from '$declarations/satellite/satellite.did';
import { idlFactory as idlFactorSatellite } from '$declarations/satellite/satellite.factory.did';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { type Actor, PocketIc } from '@dfinity/pic';
import { assertNonNullish, fromNullable, toNullable } from '@dfinity/utils';
import {
	JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER,
	JUNO_AUTH_ERROR_NOT_CONTROLLER,
	JUNO_AUTH_ERROR_NOT_WRITE_CONTROLLER,
	JUNO_COLLECTIONS_ERROR_DELETE_PREFIX_RESERVED,
	JUNO_COLLECTIONS_ERROR_MODIFY_RESERVED_COLLECTION,
	JUNO_COLLECTIONS_ERROR_PREFIX_RESERVED,
	JUNO_COLLECTIONS_ERROR_RATE_CONFIG_ENABLED,
	JUNO_COLLECTIONS_ERROR_RESERVED_COLLECTION,
	JUNO_ERROR_NO_VERSION_PROVIDED,
	JUNO_ERROR_VERSION_OUTDATED_OR_FUTURE,
	JUNO_STORAGE_ERROR_UPLOAD_NOT_ALLOWED
} from '@junobuild/errors';
import { inject } from 'vitest';
import { mockListRules } from '../../../mocks/list.mocks';
import { controllersInitArgs, SATELLITE_WASM_PATH } from '../../../utils/setup-tests.utils';

describe('Satellite', () => {
	let pic: PocketIc;
	let actor: Actor<SatelliteActor>;

	const controller = Ed25519KeyIdentity.generate();

	beforeAll(async () => {
		pic = await PocketIc.create(inject('PIC_URL'));

		const { actor: c } = await pic.setupCanister<SatelliteActor>({
			idlFactory: idlFactorSatellite,
			wasm: SATELLITE_WASM_PATH,
			arg: controllersInitArgs(controller),
			sender: controller.getPrincipal()
		});

		actor = c;
	});

	afterAll(async () => {
		await pic?.tearDown();
	});

	const setRule: SetRule = {
		memory: toNullable(),
		max_size: toNullable(),
		max_capacity: toNullable(),
		max_changes_per_user: toNullable(),
		read: { Managed: null },
		mutable_permissions: toNullable(),
		write: { Managed: null },
		version: toNullable(),
		rate_config: []
	};

	const setRuleWithValues: SetRule = {
		memory: toNullable(),
		max_size: toNullable(123n),
		max_capacity: toNullable(456),
		max_changes_per_user: toNullable(999),
		read: { Private: null },
		mutable_permissions: toNullable(false),
		write: { Private: null },
		version: toNullable(),
		rate_config: [
			{
				max_tokens: 999n,
				time_per_token_ns: 888n
			}
		]
	};

	let testRuleVersion: [] | [bigint];

	describe('admin', () => {
		beforeAll(() => {
			actor.setIdentity(controller);
		});

		it('should create a db collection', async () => {
			const { set_rule, list_rules } = actor;

			await set_rule({ Db: null }, 'test', setRule);

			const { items } = await list_rules({ Db: null }, mockListRules);

			const [[collection, { memory, version, created_at, updated_at, read, write }], _] = items;

			expect(collection).toEqual('test');
			expect(memory).toEqual(toNullable({ Stable: null }));
			expect(read).toEqual({ Managed: null });
			expect(write).toEqual({ Managed: null });
			expect(created_at).toBeGreaterThan(0n);
			expect(updated_at).toBeGreaterThan(0n);
			expect(version).toEqual(toNullable(1n));

			testRuleVersion = version;
		});

		it('should create a storage collection', async () => {
			const { set_rule, list_rules } = actor;

			await set_rule({ Storage: null }, 'test_storage', setRule);

			const { items } = await list_rules(
				{
					Storage: null
				},
				mockListRules
			);

			const [[collection, { memory, version, created_at, updated_at, read, write }], _] = items;

			expect(collection).toEqual('test_storage');
			expect(memory).toEqual(toNullable({ Stable: null }));
			expect(read).toEqual({ Managed: null });
			expect(write).toEqual({ Managed: null });
			expect(created_at).toBeGreaterThan(0n);
			expect(updated_at).toBeGreaterThan(0n);
			expect(version).toEqual(toNullable(1n));
		});

		it('should list collections', async () => {
			const { list_rules } = actor;

			const { items } = await list_rules({ Db: null }, mockListRules);
			const [
				[collection, { updated_at, created_at, memory, mutable_permissions, read, write }],
				_
			] = items;

			expect(collection).toEqual('test');
			expect(memory).toEqual(toNullable({ Stable: null }));
			expect(read).toEqual({ Managed: null });
			expect(write).toEqual({ Managed: null });
			expect(mutable_permissions).toEqual([true]);
			expect(created_at).toBeGreaterThan(0n);
			expect(updated_at).toBeGreaterThan(0n);
		});

		it('should list collections and system collection', async () => {
			const { list_rules } = actor;

			const { items } = await list_rules(
				{ Db: null },
				{
					...mockListRules,
					matcher: [
						{
							include_system: true
						}
					]
				}
			);

			expect(items.find(([c]) => c === 'test')).not.toBeUndefined();
			expect(items.find(([c]) => c === '#user')).not.toBeUndefined();
		});

		it('should get collection', async () => {
			const { get_rule } = actor;

			const result = await get_rule({ Db: null }, 'test');

			const rule = fromNullable(result);

			assertNonNullish(rule);

			const { updated_at, created_at, memory, mutable_permissions, read, write } = rule;

			expect(memory).toEqual(toNullable({ Stable: null }));
			expect(read).toEqual({ Managed: null });
			expect(write).toEqual({ Managed: null });
			expect(mutable_permissions).toEqual([true]);
			expect(created_at).toBeGreaterThan(0n);
			expect(updated_at).toBeGreaterThan(0n);
		});

		it('should add and remove collections', async () => {
			const { list_rules, set_rule, del_rule } = actor;

			await set_rule({ Db: null }, 'test2', setRule);

			const { items: rules } = await list_rules({ Db: null }, mockListRules);

			expect(rules).toHaveLength(2);

			// eslint-disable-next-line prefer-destructuring
			const [_, { version }] = rules[1];

			await del_rule({ Db: null }, 'test2', {
				version
			});

			const { items_length } = await list_rules({ Db: null }, mockListRules);

			expect(items_length).toEqual(1n);
		});

		it('should add and remove additional controller', async () => {
			const { set_controllers, del_controllers, list_controllers } = actor;

			const newController = Ed25519KeyIdentity.generate();

			const controllers = await set_controllers({
				controllers: [newController.getPrincipal()],
				controller: {
					expires_at: toNullable(),
					metadata: [],
					scope: { Admin: null }
				}
			});

			expect(controllers).toHaveLength(2);

			expect(
				controllers.find(([p]) => p.toText() === controller.getPrincipal().toText())
			).not.toBeUndefined();

			expect(
				controllers.find(([p]) => p.toText() === newController.getPrincipal().toText())
			).not.toBeUndefined();

			await del_controllers({
				controllers: [newController.getPrincipal()]
			});

			const updatedControllers = await list_controllers();

			expect(updatedControllers).toHaveLength(1);
			expect(updatedControllers[0][0].toText()).toEqual(controller.getPrincipal().toText());
		});

		describe.each([
			{ collectionType: { Db: null }, collection: 'test_db_values' },
			{
				collectionType: { Storage: null },
				collection: 'test_storage_values'
			}
		])('Edit collection %s', ({ collectionType, collection }) => {
			it('should create a db collection with values', async () => {
				const { set_rule, get_rule } = actor;

				await set_rule(collectionType, collection, setRuleWithValues);

				const result = await get_rule(collectionType, collection);

				const rule = fromNullable(result);

				assertNonNullish(rule);

				const {
					max_capacity,
					max_size,
					max_changes_per_user,
					mutable_permissions,
					rate_config,
					version,
					created_at,
					updated_at,
					read,
					write
				} = rule;

				expect(read).toEqual({ Private: null });
				expect(write).toEqual({ Private: null });
				expect(created_at).toBeGreaterThan(0n);
				expect(updated_at).toBeGreaterThan(0n);
				expect(version).toEqual(toNullable(1n));
				expect(max_capacity).toEqual(setRuleWithValues.max_capacity);
				expect(max_size).toEqual(setRuleWithValues.max_size);
				expect(mutable_permissions).toEqual(setRuleWithValues.mutable_permissions);
				expect(rate_config).toEqual(setRuleWithValues.rate_config);
				expect(max_changes_per_user).toEqual(setRuleWithValues.max_changes_per_user);
			});

			it('should create and update a collection', async () => {
				const { set_rule } = actor;

				const rule = await set_rule(collectionType, `${collection}_update`, setRule);

				const { version } = rule;

				expect(version).toEqual(toNullable(1n));

				const rule_updated = await set_rule(collectionType, `${collection}_update`, rule);

				expect(rule_updated?.version).toEqual(toNullable(2n));
			});

			it('should throw if update a collection is missing version', async () => {
				const { set_rule } = actor;

				await set_rule(collectionType, `${collection}_update_throw`, setRule);

				await expect(
					set_rule(collectionType, `${collection}_update_throw`, setRule)
				).rejects.toThrow(JUNO_ERROR_NO_VERSION_PROVIDED);
			});
		});

		describe.each([
			{ collectionType: { Db: null }, collection: '#user' },
			{ collectionType: { Db: null }, collection: '#user-usage' },
			{ collectionType: { Db: null }, collection: '#log' },
			{
				collectionType: { Storage: null },
				collection: '#dapp'
			},
			{
				collectionType: { Storage: null },
				collection: '#_juno/releases'
			}
		])('System collection %s', ({ collectionType, collection }) => {
			it('should not list system collections', async () => {
				const { list_rules } = actor;

				const { items: results } = await list_rules(collectionType, mockListRules);

				expect(results.find(([c]) => c === collection)).toBeUndefined();
			});

			it('should not list system collections when explicitly excluded', async () => {
				const { list_rules } = actor;

				const { items: results } = await list_rules(collectionType, {
					...mockListRules,
					matcher: [
						{
							include_system: false
						}
					]
				});

				expect(results.find(([c]) => c === collection)).toBeUndefined();
			});

			it('should list system collections', async () => {
				const { list_rules } = actor;

				const { items: results } = await list_rules(collectionType, {
					...mockListRules,
					matcher: [
						{
							include_system: true
						}
					]
				});

				expect(results.find(([c]) => c === collection)).not.toBeUndefined();
			});

			it('should edit system collection', async () => {
				const { get_rule, set_rule } = actor;

				const result = await get_rule(collectionType, collection);

				const rule = fromNullable(result);

				assertNonNullish(rule);

				const oldVersion = fromNullable(rule.version);

				expect(oldVersion).toBeUndefined();

				await set_rule(collectionType, collection, rule);

				const updatedResult = await get_rule(collectionType, collection);

				const updatedRule = fromNullable(updatedResult);

				assertNonNullish(updatedRule);

				expect(fromNullable(updatedRule?.version ?? [0n])).toEqual(1n);
			});

			it('should edit rate config system collection', async () => {
				const { get_rule, set_rule } = actor;

				const result = await get_rule(collectionType, collection);

				const rule = fromNullable(result);

				assertNonNullish(rule);

				await set_rule(collectionType, collection, {
					...rule,
					rate_config: [
						{
							max_tokens: 100n,
							time_per_token_ns: 10000n
						}
					]
				});

				const updatedResult = await get_rule(collectionType, collection);

				const updatedRule = fromNullable(updatedResult);

				assertNonNullish(updatedRule);

				expect(fromNullable(updatedRule?.rate_config ?? [])?.max_tokens).toEqual(100n);
				expect(fromNullable(updatedRule?.rate_config ?? [])?.time_per_token_ns).toEqual(10000n);
			});

			describe('errors', () => {
				const errorMessage = `${JUNO_COLLECTIONS_ERROR_MODIFY_RESERVED_COLLECTION} (${collection})`;

				it('should throw if read is changed on system collection', async () => {
					const { get_rule, set_rule } = actor;

					const result = await get_rule(collectionType, collection);

					const rule = fromNullable(result);

					assertNonNullish(rule);

					try {
						await set_rule(collectionType, collection, {
							...rule,
							read: { Public: null }
						});

						expect(true).toBeFalsy();
					} catch (error: unknown) {
						expect((error as Error).message).toContain(errorMessage);
					}
				});

				it('should throw if write is changed on system collection', async () => {
					const { get_rule, set_rule } = actor;

					const result = await get_rule(collectionType, collection);

					const rule = fromNullable(result);

					assertNonNullish(rule);

					try {
						await set_rule(collectionType, collection, {
							...rule,
							write: { Public: null }
						});

						expect(true).toBeFalsy();
					} catch (error: unknown) {
						expect((error as Error).message).toContain(errorMessage);
					}
				});

				it('should throw if memory is changed on system collection', async () => {
					const { get_rule, set_rule } = actor;

					const result = await get_rule(collectionType, collection);

					const rule = fromNullable(result);

					assertNonNullish(rule);

					const updateMemoryTo = 'Stable' in (fromNullable(rule.memory) ?? {}) ? 'heap' : 'stable';

					try {
						await set_rule(collectionType, collection, {
							...rule,
							memory:
								updateMemoryTo === 'heap'
									? toNullable({ Heap: null })
									: toNullable({ Stable: null })
						});

						expect(true).toBeFalsy();
					} catch (error: unknown) {
						expect((error as Error).message).toContain(errorMessage);
					}
				});

				it('should throw if mutable permissions is changed on system collection', async () => {
					const { get_rule, set_rule } = actor;

					const result = await get_rule(collectionType, collection);

					const rule = fromNullable(result);

					assertNonNullish(rule);

					try {
						await set_rule(collectionType, collection, {
							...rule,
							mutable_permissions: [true]
						});

						expect(true).toBeFalsy();
					} catch (error: unknown) {
						expect((error as Error).message).toContain(errorMessage);
					}
				});

				it('should throw if max size is changed on system collection', async () => {
					const { get_rule, set_rule } = actor;

					const result = await get_rule(collectionType, collection);

					const rule = fromNullable(result);

					assertNonNullish(rule);

					try {
						await set_rule(collectionType, collection, {
							...rule,
							max_size: [666n]
						});

						expect(true).toBeFalsy();
					} catch (error: unknown) {
						expect((error as Error).message).toContain(errorMessage);
					}
				});

				it('should throw if max capacity is changed on system collection', async () => {
					const { get_rule, set_rule } = actor;

					const result = await get_rule(collectionType, collection);

					const rule = fromNullable(result);

					assertNonNullish(rule);

					try {
						await set_rule(collectionType, collection, {
							...rule,
							max_capacity: [666]
						});

						expect(true).toBeFalsy();
					} catch (error: unknown) {
						expect((error as Error).message).toContain(errorMessage);
					}
				});

				it('should throw if rate config is deleted on system collection', async () => {
					const { get_rule, set_rule } = actor;

					const result = await get_rule(collectionType, collection);

					const rule = fromNullable(result);

					assertNonNullish(rule);

					try {
						await set_rule(collectionType, collection, {
							...rule,
							rate_config: []
						});

						expect(true).toBeFalsy();
					} catch (error: unknown) {
						expect((error as Error).message).toContain(JUNO_COLLECTIONS_ERROR_RATE_CONFIG_ENABLED);
					}
				});
			});
		});

		describe('More system collection', () => {
			it('should get db system collection', async () => {
				const { get_rule } = actor;

				const result = await get_rule({ Db: null }, '#user');

				const rule = fromNullable(result);

				assertNonNullish(rule);

				const { updated_at, created_at, memory, mutable_permissions, read, write } = rule;

				expect(memory).toEqual(toNullable({ Stable: null }));
				expect(read).toEqual({ Managed: null });
				expect(write).toEqual({ Managed: null });
				expect(mutable_permissions).toEqual([false]);
				expect(created_at).toBeGreaterThan(0n);
				expect(updated_at).toBeGreaterThan(0n);
			});

			it('should get storage system collection', async () => {
				const { get_rule } = actor;

				const result = await get_rule({ Storage: null }, '#dapp');

				const rule = fromNullable(result);

				assertNonNullish(rule);

				const { updated_at, created_at, memory, mutable_permissions, read, write } = rule;

				expect(memory).toEqual(toNullable({ Heap: null }));
				expect(read).toEqual({ Controllers: null });
				expect(write).toEqual({ Controllers: null });
				expect(mutable_permissions).toEqual([false]);
				expect(created_at).toBeGreaterThan(0n);
				expect(updated_at).toBeGreaterThan(0n);
			});

			describe('errors', () => {
				it('should throw errors on creating reserved collection', async () => {
					const { set_rule } = actor;

					await expect(set_rule({ Db: null }, '#test', setRule)).rejects.toThrow(
						JUNO_COLLECTIONS_ERROR_PREFIX_RESERVED
					);
				});

				// This would mean the assertions has changed and the implementation of prepare sys collection is hit with an undefined existing rule
				it('should not throw errors on creating reserved collection', async () => {
					const { set_rule } = actor;

					await expect(set_rule({ Db: null }, '#test', setRule)).rejects.not.toThrow(
						JUNO_COLLECTIONS_ERROR_RESERVED_COLLECTION
					);
				});

				it('should throw errors on deleting reserved collection', async () => {
					const { get_rule, del_rule } = actor;

					const systemCollection = '#user';

					const result = await get_rule({ Db: null }, systemCollection);

					const rule = fromNullable(result);

					assertNonNullish(rule);

					const { version } = rule;

					await expect(
						del_rule({ Db: null }, systemCollection, {
							version
						})
					).rejects.toThrow(`${JUNO_COLLECTIONS_ERROR_DELETE_PREFIX_RESERVED} (#)`);
				});
			});
		});

		describe('errors', () => {
			it('should not update rule if no version', async () => {
				const { set_rule } = actor;

				await set_rule({ Db: null }, 'test3', setRule);

				await pic.advanceTime(100);

				await expect(set_rule({ Db: null }, 'test3', setRule)).rejects.toThrow(
					JUNO_ERROR_NO_VERSION_PROVIDED
				);
			});

			it('should not update rule if invalid version', async () => {
				const { set_rule } = actor;

				await set_rule({ Db: null }, 'test4', setRule);

				await pic.advanceTime(100);

				try {
					await set_rule({ Db: null }, 'test4', {
						...setRule,
						version: [123n]
					});

					expect(true).toBeFalsy();
				} catch (error: unknown) {
					expect((error as Error).message).toContain(JUNO_ERROR_VERSION_OUTDATED_OR_FUTURE);
				}
			});
		});
	});

	describe('admin guard', () => {
		const user = Ed25519KeyIdentity.generate();

		beforeAll(() => {
			actor.setIdentity(user);
		});

		it('should throw errors on creating collections', async () => {
			const { set_rule } = actor;

			await expect(set_rule({ Db: null }, 'user-test', setRule)).rejects.toThrow(
				JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER
			);
		});

		it('should throw errors on list collections', async () => {
			const { list_rules } = actor;

			await expect(list_rules({ Db: null }, mockListRules)).rejects.toThrow(
				JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER
			);
		});

		it('should throw errors on getting a collection', async () => {
			const { get_rule } = actor;

			await expect(get_rule({ Db: null }, 'test')).rejects.toThrow(
				JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER
			);
		});

		it('should throw errors on deleting collections', async () => {
			const { del_rule } = actor;

			await expect(del_rule({ Db: null }, 'test', { version: testRuleVersion })).rejects.toThrow(
				JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER
			);
		});

		it('should throw errors on creating controller', async () => {
			const { set_controllers } = actor;

			const controller = Ed25519KeyIdentity.generate();

			await expect(
				set_controllers({
					controllers: [controller.getPrincipal()],
					controller: {
						expires_at: toNullable(),
						metadata: [],
						scope: { Admin: null }
					}
				})
			).rejects.toThrow(JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER);
		});

		it('should throw errors on list controllers', async () => {
			const { list_controllers } = actor;

			await expect(list_controllers()).rejects.toThrow(JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER);
		});

		it('should throw errors on deleting controller', async () => {
			const { del_controllers } = actor;

			await expect(
				del_controllers({
					controllers: [controller.getPrincipal()]
				})
			).rejects.toThrow(JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER);
		});

		it('should throw errors on deleting docs', async () => {
			const { del_docs } = actor;

			await expect(del_docs('test')).rejects.toThrow(JUNO_AUTH_ERROR_NOT_WRITE_CONTROLLER);
		});

		it('should throw errors on counting docs', async () => {
			const { count_collection_docs } = actor;

			await expect(count_collection_docs('test')).rejects.toThrow(
				JUNO_AUTH_ERROR_NOT_WRITE_CONTROLLER
			);
		});

		it('should throw errors on deleting assets', async () => {
			const { del_assets } = actor;

			await expect(del_assets('test')).rejects.toThrow(JUNO_AUTH_ERROR_NOT_WRITE_CONTROLLER);
		});

		it('should throw errors on counting assets', async () => {
			const { count_collection_assets } = actor;

			await expect(count_collection_assets('test')).rejects.toThrow(
				JUNO_AUTH_ERROR_NOT_WRITE_CONTROLLER
			);
		});

		it('should throw errors on deposit cycles', async () => {
			const { deposit_cycles } = actor;

			await expect(
				deposit_cycles({
					cycles: 123n,
					destination_id: user.getPrincipal()
				})
			).rejects.toThrow(JUNO_AUTH_ERROR_NOT_ADMIN_CONTROLLER);
		});

		it('should throw errors on trying to deploy dapp', async () => {
			const { init_asset_upload } = actor;

			await expect(
				init_asset_upload({
					collection: '#dapp',
					description: toNullable(),
					encoding_type: [],
					full_path: '/hello.html',
					name: 'hello.html',
					token: toNullable()
				})
			).rejects.toThrow(JUNO_STORAGE_ERROR_UPLOAD_NOT_ALLOWED);
		});

		it('should throw errors on memory size', async () => {
			const { memory_size } = actor;

			await expect(memory_size()).rejects.toThrow(JUNO_AUTH_ERROR_NOT_CONTROLLER);
		});
	});
});
