<template>
    <main class="x-container w-full">
        <div class="max-w-xl mx-auto">
            <Button variant="ghost" @click="router.push({ name: watchState.isLoggedIn ? 'feed' : 'login' })"
                ><i class="ri-arrow-left-line" />Back to VRCX</Button
            >
            <h1 class="text-xl font-semibold mt-4">Phone settings</h1>
            <PhoneSettingsPanel />
        </div>
    </main>
</template>
<script setup>
    import { useRouter } from 'vue-router';
    import { Button } from '../../components/ui/button';
    import { watchState } from '../../services/watchState';
    import PhoneSettingsPanel from './PhoneSettingsPanel.vue';
    const router = useRouter();
</script>
