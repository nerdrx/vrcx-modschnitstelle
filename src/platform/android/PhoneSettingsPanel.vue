<template>
    <div class="flex flex-col gap-5 py-4">
        <section class="rounded-xl border p-4 space-y-3">
            <h2 class="font-semibold">Your desktop history</h2>
            <p class="text-sm text-muted-foreground">
                Friend Care and Orbit Graph use your past VRChat sessions. Your phone cannot read the game logs on your
                PC.
            </p>
            <p class="text-sm text-muted-foreground">
                Close VRCX on your PC, copy VRCX.sqlite3 to your phone, then import it here. Only world visits and
                join/leave history are copied. Phone accounts and settings stay here.
            </p>
            <Button :disabled="importing" @click="importHistory"
                ><i class="ri-history-line" />{{ importing ? 'Importing…' : 'Import desktop history' }}</Button
            >
            <p v-if="result" role="status" class="text-sm">{{ result }}</p>
            <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
        </section>
        <section class="rounded-xl border p-4 space-y-3">
            <h2 class="font-semibold">Phone notifications</h2>
            <p class="text-sm text-muted-foreground">
                {{
                    notificationPermission === 'granted'
                        ? 'Android notifications are allowed.'
                        : 'Allow notifications for invites and pool chat.'
                }}
            </p>
            <Button variant="outline" @click="requestNotifications">Allow notifications</Button>
            <p class="text-sm text-muted-foreground">
                This first version stays connected while the app is open. Android may pause it in the background;
                notifications are not guaranteed when it is closed.
            </p>
        </section>
        <section class="space-y-2 text-sm text-muted-foreground">
            <p>{{ appVersion || 'VRCX with Mods for Android' }}</p>
            <p>
                Standalone VRChat login and pool chat. Status Tracker records events received by this phone;
                desktop-history import is manual.
            </p>
            <p>VR overlays, PC log capture and the desktop voice sidecar are unavailable on Android.</p>
            <Button variant="link" @click="openSource">Source and MIT licence</Button>
        </section>
    </div>
</template>

<script setup>
    import { onMounted, ref } from 'vue';
    import { Button } from '../../components/ui/button';
    const importing = ref(false);
    const result = ref('');
    const error = ref('');
    const notificationPermission = ref(window.Notification.permission);
    const appVersion = ref('');
    onMounted(async () => {
        appVersion.value = await AppApi.GetVersion();
    });
    function openSource() {
        AppApi.OpenLink('https://github.com/nerdrx/vrcx-modschnitstelle');
    }
    async function importHistory() {
        importing.value = true;
        result.value = '';
        error.value = '';
        try {
            const imported = await AppApi.ImportHistory();
            if (!imported.cancelled)
                result.value = `Imported ${imported.locations} world visits and ${imported.joins} join/leave events. Reopen a mod view to refresh its history.`;
        } catch (failure) {
            error.value = failure.message;
        } finally {
            importing.value = false;
        }
    }
    async function requestNotifications() {
        try {
            notificationPermission.value = await window.Notification.requestPermission();
        } catch (failure) {
            error.value = failure.message;
        }
    }
</script>
