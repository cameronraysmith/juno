<script lang="ts">
	import type { Principal } from '@dfinity/principal';
	import UserProvider from '$lib/components/auth/UserProvider.svelte';
	import ButtonTableAction from '$lib/components/ui/ButtonTableAction.svelte';
	import Identifier from '$lib/components/ui/Identifier.svelte';
	import { openUserDetail } from '$lib/services/user.services';
	import { authStore } from '$lib/stores/auth.store';
	import { i18n } from '$lib/stores/i18n.store';
	import type { User } from '$lib/types/user';
	import { formatToDate } from '$lib/utils/date.utils';

	interface Props {
		user: User;
		satelliteId: Principal;
	}

	let { user, satelliteId }: Props = $props();

	let { owner, created_at } = $derived(user);

	const openModal = async () => {
		await openUserDetail({
			user,
			satelliteId,
			identity: $authStore.identity
		});
	};
</script>

<tr>
	<td class="actions">
		<ButtonTableAction
			icon="visibility"
			ariaLabel={$i18n.users.view_details}
			onaction={openModal}
		/>
	</td>
	<td><Identifier small={false} identifier={owner.toText()} /></td>
	<td class="providers">
		<UserProvider {user} />
	</td>
	<td class="created">{formatToDate(created_at)}</td>
</tr>

<style lang="scss">
	@use '../../styles/mixins/media';

	.providers {
		vertical-align: middle;
	}

	.providers {
		display: none;

		@include media.min-width(small) {
			display: table-cell;
		}
	}

	.created {
		display: none;

		@include media.min-width(medium) {
			display: table-cell;
		}
	}
</style>
