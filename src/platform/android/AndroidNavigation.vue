<template>
    <nav class="android-navigation" aria-label="Phone navigation">
        <Button
            v-for="item in quickLinks"
            :key="item.route"
            variant="ghost"
            :aria-current="route.name === item.route ? 'page' : undefined"
            @click="router.push({ name: item.route })">
            <i :class="item.icon" aria-hidden="true" />{{ item.label }}
        </Button>
        <Button variant="ghost" @click="menu = 'mods'"><i class="ri-puzzle-line" aria-hidden="true" />Mods</Button>
        <Button variant="ghost" @click="menu = 'all'"><i class="ri-menu-line" aria-hidden="true" />Menu</Button>
    </nav>
    <Sheet
        :open="!!menu"
        @update:open="
            (value) => {
                if (!value) menu = '';
            }
        ">
        <SheetContent side="bottom" class="max-h-[80dvh] overflow-auto rounded-t-2xl">
            <SheetHeader>
                <SheetTitle>{{ menu === 'mods' ? 'Our mods' : 'Explore VRCX' }}</SheetTitle>
                <SheetDescription>{{
                    menu === 'mods'
                        ? 'Your extra tools, made for your phone.'
                        : 'Worlds, avatars, notifications and settings.'
                }}</SheetDescription>
            </SheetHeader>
            <div class="grid grid-cols-2 gap-2 p-3">
                <Button
                    v-if="menu === 'all'"
                    variant="outline"
                    :disabled="friendStore.isRefreshFriendsLoading"
                    :aria-label="t('side_panel.refresh_tooltip')"
                    @click="refreshFriends">
                    <i class="ri-refresh-line" aria-hidden="true" />{{ t('side_panel.refresh_tooltip') }}
                </Button>
                <Button
                    v-for="item in menuItems"
                    :key="item.key"
                    variant="outline"
                    class="justify-start whitespace-normal h-auto py-3"
                    @click="navigate(item.routeName)">
                    <i :class="item.icon" aria-hidden="true" />{{ t(item.labelKey) }}
                </Button>
                <Button v-if="menu === 'all'" variant="outline" @click="navigate('settings')"
                    ><i class="ri-settings-line" />Settings</Button
                >
                <Button v-if="menu === 'all'" variant="outline" @click="navigate('android-phone')"
                    ><i class="ri-smartphone-line" />Phone settings</Button
                >
            </div>
        </SheetContent>
    </Sheet>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { useRoute, useRouter } from 'vue-router';
    import { useI18n } from 'vue-i18n';
    import { Button } from '../../components/ui/button';
    import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
    import { navDefinitions } from '../../shared/constants/ui';
    import { useFriendStore } from '../../stores/friend';
    import { runRefreshFriendsListFlow } from '../../coordinators/friendSyncCoordinator';

    const route = useRoute();
    const router = useRouter();
    const { t } = useI18n();
    const menu = ref('');
    const friendStore = useFriendStore();
    const quickLinks = [
        { route: 'feed', label: 'Feed', icon: 'ri-rss-line' },
        { route: 'friends-locations', label: 'Friends', icon: 'ri-user-location-line' },
        { route: 'notification', label: 'Invites', icon: 'ri-mail-line' }
    ];
    const unavailable = new Set(['player-list', 'tools', 'tool-screenshot-metadata']);
    const menuItems = computed(() =>
        navDefinitions.filter(
            (item) =>
                router.hasRoute(item.routeName) &&
                !unavailable.has(item.key) &&
                (menu.value !== 'mods' || item.key.startsWith('mod-'))
        )
    );
    function navigate(name) {
        menu.value = '';
        router.push({ name });
    }
    async function refreshFriends() {
        menu.value = '';
        try {
            await runRefreshFriendsListFlow();
        } catch (error) {
            console.error('Friend refresh failed:', error);
        }
    }
</script>

<style scoped>
    .android-navigation {
        display: flex;
        flex-shrink: 0;
        justify-content: space-around;
        gap: 2px;
        border-top: 1px solid var(--border);
        background: var(--sidebar);
        padding: 6px 4px max(6px, env(safe-area-inset-bottom));
    }
    .android-navigation button {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px;
        height: 54px;
        font-size: 11px;
        border-radius: 10px;
    }
    .android-navigation i {
        font-size: 20px;
    }
    .android-navigation [aria-current='page'] {
        color: var(--primary);
        background: var(--accent);
    }
</style>
