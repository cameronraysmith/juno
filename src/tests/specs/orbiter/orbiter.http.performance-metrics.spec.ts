import type {
	_SERVICE as OrbiterActor,
	OrbiterSatelliteFeatures
} from '$declarations/orbiter/orbiter.did';
import { idlFactory as idlFactorOrbiter } from '$declarations/orbiter/orbiter.factory.did';
import type { HttpRequest } from '$declarations/satellite/satellite.did';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { type Actor, PocketIc } from '@dfinity/pic';
import { fromNullable, jsonReviver, toNullable } from '@dfinity/utils';
import { nanoid } from 'nanoid';
import { inject } from 'vitest';
import {
	type PerformanceMetricPayload,
	performanceMetricPayloadMock,
	satelliteIdMock,
	type SetPerformanceRequest,
	type SetPerformancesRequest,
	userAgentHeadersMock
} from '../../mocks/orbiter.mocks';
import { toBodyJson } from '../../utils/orbiter-tests.utils';
import { tick } from '../../utils/pic-tests.utils';
import { controllersInitArgs, ORBITER_WASM_PATH } from '../../utils/setup-tests.utils';

describe('Orbiter > HTTP > Performance metrics', () => {
	let pic: PocketIc;
	let actor: Actor<OrbiterActor>;

	const controller = Ed25519KeyIdentity.generate();

	const currentDate = new Date(2021, 6, 10, 0, 0, 0, 0);

	const NON_POST_METHODS = ['GET', 'PUT', 'PATCH', 'DELETE'];

	const RESPONSE_OK = { ok: { data: null } };

	beforeAll(async () => {
		pic = await PocketIc.create(inject('PIC_URL'));

		await pic.setTime(currentDate.getTime());

		const { actor: c } = await pic.setupCanister<OrbiterActor>({
			idlFactory: idlFactorOrbiter,
			wasm: ORBITER_WASM_PATH,
			arg: controllersInitArgs(controller),
			sender: controller.getPrincipal()
		});

		actor = c;

		// Certified responses are initialized asynchronously
		await tick(pic);
	});

	afterAll(async () => {
		await pic?.tearDown();
	});

	describe('With configuration', () => {
		const performanceMetric: SetPerformanceRequest = {
			satellite_id: satelliteIdMock.toText(),
			key: { key: nanoid(), collected_at: 1230n },
			performance_metric: performanceMetricPayloadMock
		};

		const performanceMetrics: SetPerformancesRequest = {
			satellite_id: satelliteIdMock.toText(),
			performance_metrics: [
				{
					key: { key: nanoid(), collected_at: 1230n },
					performance_metric: performanceMetricPayloadMock
				},
				{
					key: { key: nanoid(), collected_at: 1240n },
					performance_metric: performanceMetricPayloadMock
				}
			]
		};

		beforeAll(async () => {
			actor.setIdentity(controller);

			const allFeatures: OrbiterSatelliteFeatures = {
				page_views: true,
				performance_metrics: true,
				track_events: true
			};

			const { set_satellite_configs } = actor;

			await set_satellite_configs([
				[
					satelliteIdMock,
					{
						version: [],
						restricted_origin: [],
						features: [allFeatures]
					}
				]
			]);
		});

		describe('user', () => {
			const user = Ed25519KeyIdentity.generate();

			beforeAll(() => {
				actor.setIdentity(user);
			});

			describe('performance metric', () => {
				const body = toBodyJson(performanceMetric);

				it('should upgrade http_request', async () => {
					const { http_request } = actor;

					const request: HttpRequest = {
						body,
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request(request);

					expect(fromNullable(response.upgrade)).toBeTruthy();
				});

				it.each(NON_POST_METHODS)('should not upgrade http_request for %s', async (method) => {
					const { http_request } = actor;

					const request: HttpRequest = {
						body,
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method,
						url: '/metric'
					};

					const response = await http_request(request);

					expect(fromNullable(response.upgrade)).toBeUndefined();
				});

				const invalidPayloads: [string, Record<string, unknown>][] = [
					['invalid payload', { ...performanceMetric, key: 'invalid' }],
					[
						'empty payload',
						{ key: performanceMetric.key, satellite_id: performanceMetric.satellite_id }
					],
					[
						'unknown satellite id',
						{ ...performanceMetric, satellite_id: 'nkzsw-gyaaa-aaaal-ada3a-cai' }
					]
				];

				// eslint-disable-next-line local-rules/prefer-object-params
				it.each(invalidPayloads)('should upgrade http_request for %s', async (_title, payload) => {
					const { http_request } = actor;

					const request: HttpRequest = {
						body: toBodyJson(payload),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request(request);

					expect(fromNullable(response.upgrade)).toBeTruthy();
				});

				it('should return a bad request for invalid type', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson(invalidPayloads[0][1]),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(400);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const {
						err: { message }
					}: { err: { message: string } } = JSON.parse(responseBody, jsonReviver);

					expect(message.includes('invalid type: string "invalid"')).toBeTruthy();
				});

				it('should return a bad request for missing field', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson(invalidPayloads[1][1]),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(400);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const {
						err: { message }
					}: { err: { message: string } } = JSON.parse(responseBody, jsonReviver);

					expect(message.includes('missing field `performance_metric`')).toBeTruthy();
				});

				it('should return forbidden for unknown satellite', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson(invalidPayloads[2][1]),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(403);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const {
						err: { message }
					}: { err: { message: string } } = JSON.parse(responseBody, jsonReviver);

					expect(message).toEqual('error_performance_metrics_feature_disabled');
				});

				it('should not set a performance metric with invalid satellite id', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson({
							...performanceMetric,
							satellite_id: satelliteIdMock // Should be principal as text
						}),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(400);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const {
						err: { message }
					}: { err: { message: string } } = JSON.parse(responseBody, jsonReviver);

					expect(message.includes('invalid type')).toBeTruthy();
				});

				it('should set a performance metric', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body,
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(200);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const {
						ok: { data }
					}: { ok: { data: PerformanceMetricPayload } } = JSON.parse(responseBody, jsonReviver);

					const { version, created_at, updated_at, ...rest } = data;

					const { user_agent: _, ...restMock } = performanceMetricPayloadMock;

					expect(rest).toEqual(restMock);
					expect(version).toEqual(1n);
					expect(created_at).toBeGreaterThan(0n);
					expect(updated_at).toBeGreaterThan(0n);
					expect(created_at).toEqual(updated_at);
				});

				it('should fail at updating performance metric without version', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body,
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request_update(request);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const result = JSON.parse(responseBody, jsonReviver);

					expect(result).toEqual({ err: { code: 403, message: 'juno.error.no_version_provided' } });
				});

				it('should update a performance metric', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson({
							...performanceMetric,
							performance_metric: {
								...performanceMetric.performance_metric,
								version: 1n
							}
						}),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metric'
					};

					const response = await http_request_update(request);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const {
						ok: { data }
					}: { ok: { data: PerformanceMetricPayload } } = JSON.parse(responseBody, jsonReviver);

					const { version } = data;

					expect(version).toEqual(2n);
				});
			});

			describe('performance metrics', () => {
				const body = toBodyJson(performanceMetrics);

				it('should upgrade http_request', async () => {
					const { http_request } = actor;

					const request: HttpRequest = {
						body,
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request(request);

					expect(fromNullable(response.upgrade)).toBeTruthy();
				});

				it.each(NON_POST_METHODS)('should not upgrade http_request for %s', async (method) => {
					const { http_request } = actor;

					const request: HttpRequest = {
						body,
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method,
						url: '/metrics'
					};

					const response = await http_request(request);

					expect(fromNullable(response.upgrade)).toBeUndefined();
				});

				const invalidPayloads: [string, Record<string, unknown>][] = [
					[
						'invalid payload',
						{
							...performanceMetrics,
							performance_metrics: [
								{
									...performanceMetrics.performance_metrics[0],
									key: 'invalid'
								}
							]
						}
					],
					[
						'empty payload',
						{ satellite_id: performanceMetrics.satellite_id, performance_metrics: [] }
					],
					[
						'unknown satellite id',
						{ ...performanceMetrics, satellite_id: 'nkzsw-gyaaa-aaaal-ada3a-cai' }
					]
				];

				// eslint-disable-next-line local-rules/prefer-object-params
				it.each(invalidPayloads)('should upgrade http_request for %s', async (_title, payload) => {
					const { http_request } = actor;

					const request: HttpRequest = {
						body: toBodyJson(payload),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request(request);

					expect(fromNullable(response.upgrade)).toBeTruthy();
				});

				it('should return a bad request for invalid type', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson(invalidPayloads[0][1]),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(400);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const {
						err: { message }
					}: { err: { message: string } } = JSON.parse(responseBody, jsonReviver);

					expect(message.includes('invalid type: string "invalid"')).toBeTruthy();
				});

				it('should return ok for empty payload', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson(invalidPayloads[1][1]),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(200);
				});

				it('should return forbidden for unknown satellite', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson(invalidPayloads[2][1]),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(403);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const {
						err: { message }
					}: { err: { message: string } } = JSON.parse(responseBody, jsonReviver);

					expect(message.includes('error_performance_metrics_feature_disabled')).toBeTruthy();
				});

				it('should not set performance metrics with invalid satellite id', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson({
							performance_metrics: [
								{
									...performanceMetric,
									...performanceMetricPayloadMock,
									satellite_id: satelliteIdMock // Should be principal as text
								}
							]
						}),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(400);
				});

				it('should set performance metrics', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body,
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request_update(request);

					expect(response.status_code).toEqual(200);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const result = JSON.parse(responseBody, jsonReviver);

					expect(result).toEqual(RESPONSE_OK);
				});

				it('should fail at updating performance metrics without version', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body,
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request_update(request);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const result = JSON.parse(responseBody, jsonReviver);

					expect(result).toEqual({
						err: {
							code: 403,
							message: performanceMetrics.performance_metrics
								.map(({ key }) => `${key.key}: juno.error.no_version_provided`)
								.join(', ')
						}
					});
				});

				it('should update performance metrics', async () => {
					const { http_request_update } = actor;

					const request: HttpRequest = {
						body: toBodyJson({
							...performanceMetrics,
							performance_metrics: performanceMetrics.performance_metrics.map(
								(performanceMetric) => ({
									...performanceMetric,
									performance_metric: {
										...performanceMetric.performance_metric,
										version: 1n
									}
								})
							)
						}),
						certificate_version: toNullable(2),
						headers: userAgentHeadersMock,
						method: 'POST',
						url: '/metrics'
					};

					const response = await http_request_update(request);

					const decoder = new TextDecoder();
					const responseBody = decoder.decode(response.body as Uint8Array<ArrayBufferLike>);

					const result = JSON.parse(responseBody, jsonReviver);

					expect(result).toEqual(RESPONSE_OK);
				});
			});
		});

		describe('controller', () => {
			beforeAll(() => {
				actor.setIdentity(controller);
			});

			it('should retrieve all performance metrics', async () => {
				const { get_performance_metrics } = actor;

				const result = await get_performance_metrics({
					from: [],
					to: [],
					satellite_id: [satelliteIdMock]
				});

				expect(Array.isArray(result)).toBeTruthy();

				expect(result).toHaveLength(
					[performanceMetric, ...performanceMetrics.performance_metrics].length
				);

				result.forEach(([key, performanceMetric]) => {
					expect(key.collected_at).toBeGreaterThanOrEqual(1230n);
					expect(key.collected_at).toBeLessThanOrEqual(1240n);
					expect(performanceMetric.metric_name).toEqual({ LCP: null });
					expect(fromNullable(performanceMetric.version)).toBe(2n);
				});
			});
		});
	});
});
