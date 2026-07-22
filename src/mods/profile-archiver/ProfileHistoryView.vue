<template>
    <div class="pa-container">
        <!-- Ambient Glass Glow Background Effects -->
        <div class="pa-glow-bg pa-glow-1"></div>
        <div class="pa-glow-bg pa-glow-2"></div>

        <!-- Mod Header -->
        <header class="pa-header">
            <div class="pa-header-title">
                <div class="pa-icon-wrapper">
                    <i class="ri-history-line pa-header-icon"></i>
                </div>
                <div>
                    <div class="pa-title-row">
                        <h2 class="pa-title">Profile History Archiver</h2>
                        <span v-if="isDemoMode" class="pa-demo-badge">
                            <i class="ri-sparkles-line"></i> Demo Mode
                        </span>
                    </div>
                    <p class="pa-subtitle">Chronological record of bio, status, and profile changes</p>
                </div>
            </div>

            <div class="pa-header-actions">
                <button
                    class="pa-btn"
                    :class="isDemoMode ? 'pa-btn-demo-active' : 'pa-btn-ghost'"
                    title="Toggle simulated profile data preview"
                    @click="toggleDemoMode">
                    <i class="ri-sparkles-line"></i>
                    <span>{{ isDemoMode ? 'Demo Data Active' : 'Enable Demo Data' }}</span>
                </button>

                <button
                    class="pa-btn pa-btn-secondary"
                    :disabled="isBackfilling"
                    title="Sync and import historical records from core VRCX feed tables"
                    @click="runBackfill">
                    <i :class="['ri-refresh-line', { 'pa-spin': isBackfilling }]"></i>
                    <span>{{ isBackfilling ? 'Syncing...' : 'Sync Feed History' }}</span>
                </button>
            </div>
        </header>

        <!-- Search & Friend Selector -->
        <div class="pa-search-section">
            <div class="pa-search-wrapper" :class="{ 'pa-search-focused': dropdownOpen }">
                <i class="ri-search-line pa-search-icon"></i>
                <input
                    v-model="searchQuery"
                    type="text"
                    class="pa-search-input"
                    placeholder="Enter User ID (usr_...) or search friend by display name..."
                    @focus="dropdownOpen = true"
                    @input="onSearchInput" />
                <button
                    v-if="searchQuery || selectedUserId"
                    class="pa-search-clear"
                    title="Clear search"
                    @click="clearSelection">
                    <i class="ri-close-line"></i>
                </button>
            </div>

            <!-- Search Dropdown Popup -->
            <div v-if="dropdownOpen && filteredFriends.length > 0" class="pa-dropdown">
                <div
                    v-for="friend in filteredFriends"
                    :key="friend.id"
                    class="pa-dropdown-item"
                    :class="{ 'pa-dropdown-item--selected': friend.id === selectedUserId }"
                    @click="selectFriend(friend)">
                    <div class="pa-avatar-container">
                        <img
                            v-if="friend.avatarUrl"
                            :src="friend.avatarUrl"
                            class="pa-dropdown-avatar"
                            alt="avatar" />
                        <div v-else class="pa-dropdown-avatar-placeholder">
                            <i class="ri-user-3-line"></i>
                        </div>
                        <span class="pa-status-dot-mini" :class="'pa-status-' + friend.status"></span>
                    </div>

                    <div class="pa-dropdown-info">
                        <div class="pa-dropdown-name">
                            <span>{{ friend.displayName }}</span>
                        </div>
                        <div class="pa-dropdown-id">{{ friend.id }}</div>
                    </div>

                    <div v-if="friend.snapshotCount !== undefined" class="pa-dropdown-badge">
                        {{ friend.snapshotCount }} logs
                    </div>
                </div>
            </div>
        </div>

        <!-- Quick Friend Selection Chips -->
        <div v-if="effectiveFriendsList.length > 0" class="pa-quick-chips">
            <span class="pa-quick-label">
                <i class="ri-flashlight-line"></i> Quick select:
            </span>
            <div class="pa-chips-scroll">
                <button
                    v-for="friend in effectiveFriendsList.slice(0, 8)"
                    :key="friend.id"
                    class="pa-chip"
                    :class="{ 'pa-chip--active': friend.id === selectedUserId }"
                    @click="selectFriend(friend)">
                    <div class="pa-chip-avatar-wrap">
                        <img v-if="friend.avatarUrl" :src="friend.avatarUrl" class="pa-chip-avatar" />
                        <span class="pa-status-dot" :class="'pa-status-' + friend.status"></span>
                    </div>
                    <span class="pa-chip-name">{{ friend.displayName }}</span>
                </button>
            </div>
        </div>

        <!-- User Profile Header Card (When a user is selected) -->
        <div v-if="selectedUserObj || selectedUserId" class="pa-user-card">
            <div class="pa-user-card-glow"></div>
            <div class="pa-user-card-body">
                <div class="pa-user-avatar-wrapper">
                    <img
                        v-if="selectedUserObj?.avatarUrl"
                        :src="selectedUserObj.avatarUrl"
                        class="pa-user-avatar"
                        alt="user avatar" />
                    <div v-else class="pa-user-avatar-placeholder">
                        <i class="ri-user-3-line"></i>
                    </div>
                    <span
                        v-if="selectedUserObj?.status"
                        class="pa-status-ring-dot"
                        :class="'pa-status-' + selectedUserObj.status"
                        :title="'Status: ' + selectedUserObj.status"></span>
                </div>

                <div class="pa-user-details">
                    <div class="pa-user-name-row">
                        <h3 class="pa-user-name">
                            {{ selectedUserObj?.displayName || currentDisplayName || selectedUserId }}
                        </h3>
                        <span
                            v-if="selectedUserObj?.status"
                            class="pa-badge pa-status-badge"
                            :class="getStatusPillClass(selectedUserObj.status)">
                            <span class="pa-status-dot" :class="'pa-status-' + selectedUserObj.status"></span>
                            {{ selectedUserObj.status }}
                        </span>
                    </div>

                    <div v-if="selectedUserObj?.statusDescription" class="pa-user-status-desc">
                        <i class="ri-chat-quote-line"></i>
                        <span>"{{ selectedUserObj.statusDescription }}"</span>
                    </div>

                    <div class="pa-user-id-row">
                        <span class="pa-user-id">{{ selectedUserId }}</span>
                        <button
                            class="pa-icon-action-btn"
                            title="Copy User ID"
                            @click="copyText(selectedUserId, 'user-id')">
                            <i :class="copiedId === 'user-id' ? 'ri-check-line pa-text-success' : 'ri-file-copy-line'"></i>
                        </button>
                        <button
                            class="pa-link-btn"
                            title="Open in VRCX User Profile"
                            @click="openUserProfile(selectedUserId)">
                            <i class="ri-external-link-line"></i>
                            <span>View Profile</span>
                        </button>
                    </div>
                </div>

                <!-- Stats Counters -->
                <div class="pa-user-stats-grid">
                    <div class="pa-stat-box pa-stat-primary">
                        <div class="pa-stat-icon-bg"><i class="ri-history-line"></i></div>
                        <span class="pa-stat-num">{{ timelineItems.length }}</span>
                        <span class="pa-stat-label">Total Snapshots</span>
                    </div>
                    <div class="pa-stat-box pa-stat-emerald">
                        <div class="pa-stat-icon-bg"><i class="ri-file-text-line"></i></div>
                        <span class="pa-stat-num">{{ bioCount }}</span>
                        <span class="pa-stat-label">Bio Changes</span>
                    </div>
                    <div class="pa-stat-box pa-stat-purple">
                        <div class="pa-stat-icon-bg"><i class="ri-user-status-line"></i></div>
                        <span class="pa-stat-num">{{ statusCount }}</span>
                        <span class="pa-stat-label">Status Shifts</span>
                    </div>
                </div>
            </div>

            <!-- Filter & Search Controls Bar -->
            <div class="pa-filter-bar">
                <div class="pa-filter-tabs">
                    <button
                        class="pa-filter-btn"
                        :class="{ 'pa-filter-btn--active': filterType === 'all' }"
                        @click="filterType = 'all'">
                        All Timeline ({{ timelineItems.length }})
                    </button>
                    <button
                        class="pa-filter-btn pa-tab-bio"
                        :class="{ 'pa-filter-btn--active': filterType === 'bio' }"
                        @click="filterType = 'bio'">
                        <i class="ri-file-text-line"></i>
                        Bios ({{ bioCount }})
                    </button>
                    <button
                        class="pa-filter-btn pa-tab-status"
                        :class="{ 'pa-filter-btn--active': filterType === 'status' }"
                        @click="filterType = 'status'">
                        <i class="ri-user-status-line"></i>
                        Statuses ({{ statusCount }})
                    </button>
                </div>

                <div class="pa-filter-right-controls">
                    <div class="pa-text-filter-wrapper">
                        <i class="ri-filter-3-line pa-text-filter-icon"></i>
                        <input
                            v-model="filterSearch"
                            type="text"
                            class="pa-text-filter-input"
                            placeholder="Filter in timeline..." />
                    </div>

                    <button
                        class="pa-sort-btn"
                        :title="sortOrder === 'desc' ? 'Switch to Oldest First' : 'Switch to Newest First'"
                        @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'">
                        <i :class="sortOrder === 'desc' ? 'ri-sort-desc' : 'ri-sort-asc'"></i>
                        <span>{{ sortOrder === 'desc' ? 'Newest First' : 'Oldest First' }}</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- Main Timeline Area -->
        <div class="pa-timeline-wrapper">
            <!-- Loading State -->
            <div v-if="loading" class="pa-state-card pa-state-loading">
                <div class="pa-spinner-glow"></div>
                <h3>Fetching Profile History...</h3>
                <p>Loading records from local snapshot storage & core feeds.</p>
            </div>

            <!-- Initial Prompt State (No User Selected) -->
            <div v-else-if="!selectedUserId" class="pa-state-card pa-state-empty">
                <div class="pa-state-icon-wrap">
                    <i class="ri-time-line pa-state-icon"></i>
                </div>
                <h3>Select a Profile to Explore Timeline</h3>
                <p>Pick a friend from quick selector above or search by user ID to view their chronological bio and status change history.</p>
                <div class="pa-empty-actions">
                    <button class="pa-btn pa-btn-primary" @click="enableDemoAndSelectFirst">
                        <i class="ri-sparkles-line"></i>
                        <span>Load Interactive Demo History</span>
                    </button>
                </div>
            </div>

            <!-- Empty History State -->
            <div v-else-if="processedTimeline.length === 0" class="pa-state-card pa-state-empty">
                <div class="pa-state-icon-wrap">
                    <i class="ri-inbox-archive-line pa-state-icon"></i>
                </div>
                <h3>No Snapshots Match Your View</h3>
                <p v-if="filterSearch || filterType !== 'all'">
                    No profile change records found matching the active filter parameters.
                </p>
                <p v-else>
                    No bio or status updates have been recorded yet for this profile.
                </p>
                <div class="pa-empty-actions">
                    <button class="pa-btn pa-btn-secondary" @click="runBackfill">
                        <i class="ri-refresh-line"></i>
                        <span>Sync Core Feed History</span>
                    </button>
                    <button v-if="!isDemoMode" class="pa-btn pa-btn-ghost" @click="toggleDemoMode">
                        <i class="ri-sparkles-line"></i>
                        <span>Preview Demo Timeline</span>
                    </button>
                </div>
            </div>

            <!-- Vertical Timeline Cards List -->
            <div v-else class="pa-timeline">
                <TransitionGroup name="pa-timeline-anim">
                    <div
                        v-for="(item, index) in processedTimeline"
                        :key="item.id || (item.created_at + '_' + index)"
                        class="pa-timeline-item"
                        :class="'pa-item-type-' + item.category">
                        
                        <!-- Axis Node Glow Icon Marker -->
                        <div
                            class="pa-timeline-node"
                            :class="'pa-node-' + item.category"
                            :title="item.badgeLabel">
                            <i :class="item.icon"></i>
                        </div>

                        <!-- Glassmorphic Timeline Card -->
                        <div class="pa-timeline-card">
                            <!-- Card Header Row -->
                            <div class="pa-card-header">
                                <div class="pa-card-type-row">
                                    <span class="pa-card-type-badge" :class="'pa-type-' + item.category">
                                        <i :class="item.icon"></i>
                                        {{ item.badgeLabel }}
                                    </span>
                                    <span class="pa-card-name">{{ item.displayName }}</span>
                                </div>
                                <div class="pa-card-time-group">
                                    <span class="pa-relative-time">{{ item.relativeTime }}</span>
                                    <span class="pa-card-time" :title="item.fullTime">
                                        <i class="ri-time-line"></i>
                                        <span>{{ item.formattedTime }}</span>
                                    </span>
                                </div>
                            </div>

                            <!-- Status Change Section -->
                            <div v-if="item.status" class="pa-card-section pa-status-section">
                                <div class="pa-section-label">
                                    <i class="ri-user-status-line"></i>
                                    <span>Status Change</span>
                                    <button
                                        class="pa-copy-tiny-btn"
                                        title="Copy Status Text"
                                        @click="copyText(item.status, 'status_' + item.id)">
                                        <i :class="copiedId === 'status_' + item.id ? 'ri-check-line pa-text-success' : 'ri-file-copy-line'"></i>
                                    </button>
                                </div>

                                <div class="pa-status-box">
                                    <div class="pa-status-current-row">
                                        <span class="pa-status-pill" :class="getStatusPillClass(item.status)">
                                            <span class="pa-status-dot"></span>
                                            {{ parseStatusMode(item.status) }}
                                        </span>
                                        <span class="pa-status-text">{{ parseStatusMsg(item.status) }}</span>
                                    </div>

                                    <!-- Previous Status Delta -->
                                    <div v-if="item.previousStatus" class="pa-delta-box pa-prev-status-box">
                                        <div class="pa-delta-header">
                                            <i class="ri-arrow-left-line"></i>
                                            <span>Previous Status:</span>
                                        </div>
                                        <div class="pa-prev-text">
                                            <span class="pa-status-pill-mini" :class="getStatusPillClass(item.previousStatus)">
                                                {{ parseStatusMode(item.previousStatus) }}
                                            </span>
                                            <span>{{ parseStatusMsg(item.previousStatus) || '(No message)' }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Bio Change Section -->
                            <div v-if="item.bio" class="pa-card-section pa-bio-section">
                                <div class="pa-section-label">
                                    <i class="ri-file-text-line"></i>
                                    <span>Bio Record</span>
                                    <button
                                        class="pa-copy-tiny-btn"
                                        title="Copy Bio Content"
                                        @click="copyText(item.bio, 'bio_' + item.id)">
                                        <i :class="copiedId === 'bio_' + item.id ? 'ri-check-line pa-text-success' : 'ri-file-copy-line'"></i>
                                    </button>
                                </div>

                                <div class="pa-bio-box">
                                    <div class="pa-bio-content">{{ item.bio }}</div>

                                    <!-- Previous Bio Comparison -->
                                    <div v-if="item.previousBio" class="pa-delta-box pa-prev-bio-box">
                                        <div class="pa-delta-header">
                                            <i class="ri-history-line"></i>
                                            <span>Previous Bio Content:</span>
                                        </div>
                                        <div class="pa-prev-bio-content">{{ item.previousBio }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </TransitionGroup>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { getCtx } from './runtime';
import { getCombinedUserHistory, backfillFromFeed } from './db';

const searchQuery = ref('');
const selectedUserId = ref('');
const timelineItems = ref([]);
const loading = ref(false);
const filterType = ref('all');
const filterSearch = ref('');
const sortOrder = ref('desc');
const dropdownOpen = ref(false);
const isBackfilling = ref(false);
const isDemoMode = ref(false);
const copiedId = ref(null);

// Realistic Mock Data for Demo Mode & Empty States
const MOCK_FRIENDS = [
    {
        id: 'usr_7f8e3b21-4d9a-4c28-98e2-123456789abc',
        displayName: 'Aetheria',
        status: 'joinme',
        statusDescription: 'Coding shaders in VRChat world! 🚀',
        bio: '✨ Shader Dev & World Creator\n💜 Synthwave enthusiast\n🌐 https://aetheria.vr\n💬 Discord: @aetheria_vr',
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Aetheria',
        snapshotCount: 5
    },
    {
        id: 'usr_1a2b3c4d-5e6f-7a8b-9c0d-112233445566',
        displayName: 'KuroNeko_VR',
        status: 'active',
        statusDescription: 'Chilling at Black Cat 🐱',
        bio: '🐾 VR Dancer | Club DJ\n🎵 Live sets every Saturday @ 9 PM UTC\n✨ DM for party invites!',
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=KuroNeko',
        snapshotCount: 3
    },
    {
        id: 'usr_99887766-5544-3322-1100-aabbccddeeff',
        displayName: 'QuantumVibe',
        status: 'busy',
        statusDescription: 'Muted - Recording video 🎬',
        bio: '🎥 VR Filmmaker & Content Creator\n🌟 100k+ subscribers\n🚀 Next premiere coming soon!',
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=QuantumVibe',
        snapshotCount: 4
    }
];

const MOCK_TIMELINE_MAP = {
    'usr_7f8e3b21-4d9a-4c28-98e2-123456789abc': [
        {
            id: 'mock_1',
            user_id: 'usr_7f8e3b21-4d9a-4c28-98e2-123456789abc',
            display_name: 'Aetheria',
            status: 'join me: Coding shaders in VRChat world! 🚀',
            previousStatus: 'active: Working on new shaders ✨',
            bio: '✨ Shader Dev & World Creator\n💜 Synthwave enthusiast\n🌐 https://aetheria.vr\n💬 Discord: @aetheria_vr',
            previousBio: '✨ Shader Dev\n💜 Synthwave enthusiast\n🌐 https://aetheria.vr',
            type: 'profile',
            created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString()
        },
        {
            id: 'mock_2',
            user_id: 'usr_7f8e3b21-4d9a-4c28-98e2-123456789abc',
            display_name: 'Aetheria',
            status: 'active: Working on new shaders ✨',
            previousStatus: 'ask me: Testing Unity 2022 upgrade 🛠️',
            bio: '',
            type: 'status',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
        },
        {
            id: 'mock_3',
            user_id: 'usr_7f8e3b21-4d9a-4c28-98e2-123456789abc',
            display_name: 'Aetheria',
            status: '',
            bio: '✨ Shader Dev\n💜 Synthwave enthusiast\n🌐 https://aetheria.vr',
            previousBio: 'VRChat Creator | Shader Enthusiast | WIP Projects',
            type: 'bio',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString()
        },
        {
            id: 'mock_4',
            user_id: 'usr_7f8e3b21-4d9a-4c28-98e2-123456789abc',
            display_name: 'Aetheria',
            status: 'ask me: Testing Unity 2022 upgrade 🛠️',
            previousStatus: 'busy: AFK rendering lightmaps ⏳',
            bio: '',
            type: 'status',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString()
        },
        {
            id: 'mock_5',
            user_id: 'usr_7f8e3b21-4d9a-4c28-98e2-123456789abc',
            display_name: 'Aetheria',
            status: '',
            bio: 'VRChat Creator | Shader Enthusiast | WIP Projects',
            previousBio: 'Just another VRChat user ~',
            type: 'bio',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString()
        }
    ],
    'usr_1a2b3c4d-5e6f-7a8b-9c0d-112233445566': [
        {
            id: 'mock_k1',
            user_id: 'usr_1a2b3c4d-5e6f-7a8b-9c0d-112233445566',
            display_name: 'KuroNeko_VR',
            status: 'active: Chilling at Black Cat 🐱',
            previousStatus: 'join me: DJ Set Live Now! 🎧🔥',
            bio: '🐾 VR Dancer | Club DJ\n🎵 Live sets every Saturday @ 9 PM UTC\n✨ DM for party invites!',
            type: 'profile',
            created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString()
        },
        {
            id: 'mock_k2',
            user_id: 'usr_1a2b3c4d-5e6f-7a8b-9c0d-112233445566',
            display_name: 'KuroNeko_VR',
            status: 'join me: DJ Set Live Now! 🎧🔥',
            previousStatus: 'active: Soundcheck in progress...',
            bio: '',
            type: 'status',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString()
        },
        {
            id: 'mock_k3',
            user_id: 'usr_1a2b3c4d-5e6f-7a8b-9c0d-112233445566',
            display_name: 'KuroNeko_VR',
            status: '',
            bio: '🐾 VR Dancer | Club DJ\n🎵 Live sets every Saturday @ 9 PM UTC\n✨ DM for party invites!',
            previousBio: 'VR Dancer & music enthusiast',
            type: 'bio',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString()
        }
    ],
    'usr_99887766-5544-3322-1100-aabbccddeeff': [
        {
            id: 'mock_q1',
            user_id: 'usr_99887766-5544-3322-1100-aabbccddeeff',
            display_name: 'QuantumVibe',
            status: 'busy: Muted - Recording video 🎬',
            previousStatus: 'active: Editing episode 4 ✂️',
            bio: '🎥 VR Filmmaker & Content Creator\n🌟 100k+ subscribers\n🚀 Next premiere coming soon!',
            previousBio: '🎥 VR Filmmaker & Content Creator',
            type: 'profile',
            created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString()
        },
        {
            id: 'mock_q2',
            user_id: 'usr_99887766-5544-3322-1100-aabbccddeeff',
            display_name: 'QuantumVibe',
            status: 'active: Editing episode 4 ✂️',
            previousStatus: 'ask me: Script brainstorming session 📝',
            bio: '',
            type: 'status',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString()
        },
        {
            id: 'mock_q3',
            user_id: 'usr_99887766-5544-3322-1100-aabbccddeeff',
            display_name: 'QuantumVibe',
            status: '',
            bio: '🎥 VR Filmmaker & Content Creator',
            previousBio: 'VRChat video creator',
            type: 'bio',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString()
        },
        {
            id: 'mock_q4',
            user_id: 'usr_99887766-5544-3322-1100-aabbccddeeff',
            display_name: 'QuantumVibe',
            status: 'ask me: Script brainstorming session 📝',
            previousStatus: 'offline',
            bio: '',
            type: 'status',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString()
        }
    ]
};

const friendsList = computed(() => {
    try {
        const ctx = getCtx();
        const map = ctx.stores.friends.friends;
        if (!map || map.size === 0) return [];
        const result = [];
        for (const [id, friendObj] of map.entries()) {
            const refObj = friendObj?.ref || friendObj;
            result.push({
                id,
                displayName: refObj?.displayName || friendObj?.name || id,
                status: refObj?.status || 'offline',
                statusDescription: refObj?.statusDescription || '',
                bio: refObj?.bio || '',
                avatarUrl: refObj?.currentAvatarThumbnailImageUrl || refObj?.userIcon || ''
            });
        }
        return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch {
        return [];
    }
});

const effectiveFriendsList = computed(() => {
    if (friendsList.value.length > 0 && !isDemoMode.value) {
        return friendsList.value;
    }
    return MOCK_FRIENDS;
});

const filteredFriends = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return effectiveFriendsList.value.slice(0, 10);
    return effectiveFriendsList.value
        .filter(
            (f) =>
                f.displayName.toLowerCase().includes(q) ||
                f.id.toLowerCase().includes(q)
        )
        .slice(0, 10);
});

const selectedUserObj = computed(() => {
    if (!selectedUserId.value) return null;
    return effectiveFriendsList.value.find((f) => f.id === selectedUserId.value) || null;
});

const currentDisplayName = computed(() => {
    if (timelineItems.value.length > 0) {
        return timelineItems.value[0].display_name || timelineItems.value[0].displayName || '';
    }
    return '';
});

const bioCount = computed(() => {
    return timelineItems.value.filter((i) => (i.bio && i.bio.trim().length > 0) || i.type === 'bio').length;
});

const statusCount = computed(() => {
    return timelineItems.value.filter((i) => (i.status && i.status.trim().length > 0) || i.type === 'status').length;
});

const processedTimeline = computed(() => {
    let items = [...timelineItems.value];

    // Filter by type
    if (filterType.value === 'bio') {
        items = items.filter((i) => (i.bio && i.bio.trim().length > 0) || i.type === 'bio');
    } else if (filterType.value === 'status') {
        items = items.filter((i) => (i.status && i.status.trim().length > 0) || i.type === 'status');
    }

    // Search filter inside items
    if (filterSearch.value.trim()) {
        const sq = filterSearch.value.trim().toLowerCase();
        items = items.filter((i) => {
            const bioText = (i.bio || '').toLowerCase();
            const statusText = (i.status || '').toLowerCase();
            const prevBioText = (i.previousBio || '').toLowerCase();
            const prevStatusText = (i.previousStatus || '').toLowerCase();
            return bioText.includes(sq) || statusText.includes(sq) || prevBioText.includes(sq) || prevStatusText.includes(sq);
        });
    }

    // Sort order
    if (sortOrder.value === 'asc') {
        items.sort((a, b) => new Date(a.created_at || a.createdAt).getTime() - new Date(b.created_at || b.createdAt).getTime());
    } else {
        items.sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());
    }

    // Deduplicate consecutive identical items based on bio and status
    const deduplicated = [];
    for (let i = 0; i < items.length; i++) {
        const current = items[i];
        const prev = deduplicated[deduplicated.length - 1];
        if (prev && current.bio === prev.bio && current.status === prev.status) {
            continue; // Skip consecutive duplicates
        }
        deduplicated.push(current);
    }
    items = deduplicated;

    return items.map((item) => {
        const dtStr = item.created_at || item.createdAt;
        const dt = new Date(dtStr);
        const isValidDate = !isNaN(dt.getTime());

        const formattedTime = isValidDate
            ? dt.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
              })
            : dtStr;

        const relativeTime = isValidDate ? formatRelativeTime(dtStr) : '';

        let category = 'snapshot';
        let icon = 'ri-history-line';
        let badgeLabel = 'Snapshot';

        if (item.type === 'profile' || (item.bio && item.status)) {
            category = 'profile';
            icon = 'ri-user-star-line';
            badgeLabel = 'Profile Update';
        } else if (item.type === 'bio' || (item.bio && !item.status)) {
            category = 'bio';
            icon = 'ri-file-text-line';
            badgeLabel = 'Bio Record';
        } else if (item.type === 'status' || (item.status && !item.bio)) {
            category = 'status';
            icon = 'ri-user-status-line';
            badgeLabel = 'Status Shift';
        }

        return {
            ...item,
            category,
            icon,
            badgeLabel,
            displayName: item.display_name || item.displayName || 'Unknown User',
            formattedTime,
            relativeTime,
            fullTime: dtStr
        };
    });
});

function selectFriend(friend) {
    selectedUserId.value = friend.id;
    searchQuery.value = friend.displayName;
    dropdownOpen.value = false;
    loadHistory();
}

function onSearchInput() {
    const val = searchQuery.value.trim();
    if (val.startsWith('usr_')) {
        selectedUserId.value = val;
        loadHistory();
    }
}

function clearSelection() {
    searchQuery.value = '';
    selectedUserId.value = '';
    timelineItems.value = [];
    dropdownOpen.value = false;
}

function toggleDemoMode() {
    isDemoMode.value = !isDemoMode.value;
    if (isDemoMode.value && !selectedUserId.value) {
        selectFriend(MOCK_FRIENDS[0]);
    } else {
        loadHistory();
    }
}

function enableDemoAndSelectFirst() {
    isDemoMode.value = true;
    selectFriend(MOCK_FRIENDS[0]);
}

async function loadHistory() {
    if (!selectedUserId.value) {
        timelineItems.value = [];
        return;
    }

    loading.value = true;
    try {
        let items = [];
        if (!isDemoMode.value) {
            try {
                const ctx = getCtx();
                items = await getCombinedUserHistory(ctx, selectedUserId.value);
            } catch (_e) {
                // Fallback gracefully if context is unavailable
            }
        }

        if ((!items || items.length === 0) && (isDemoMode.value || MOCK_TIMELINE_MAP[selectedUserId.value])) {
            items = MOCK_TIMELINE_MAP[selectedUserId.value] || [];
        }

        timelineItems.value = items;
    } catch (err) {
        console.error('Failed to load user history:', err);
    } finally {
        loading.value = false;
    }
}

async function runBackfill() {
    isBackfilling.value = true;
    try {
        try {
            const ctx = getCtx();
            await backfillFromFeed(ctx, selectedUserId.value || null);
        } catch (_e) {
            // Fallback gracefully if context is unavailable
        }
        if (selectedUserId.value) {
            await loadHistory();
        }
    } catch (err) {
        console.error('Backfill error:', err);
    } finally {
        isBackfilling.value = false;
    }
}

function openUserProfile(userId) {
    if (!userId) return;
    try {
        getCtx().ui.showUserDialog(userId);
    } catch (err) {
        console.error('Failed to open user dialog:', err);
    }
}

function copyText(text, idKey) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        copiedId.value = idKey;
        setTimeout(() => {
            if (copiedId.value === idKey) copiedId.value = null;
        }, 2000);
    });
}

function parseStatusMode(statusStr) {
    if (!statusStr) return 'Active';
    const lower = statusStr.toLowerCase();
    if (lower.includes('join me') || lower.startsWith('joinme')) return 'Join Me';
    if (lower.includes('ask me') || lower.startsWith('askme')) return 'Ask Me';
    if (lower.includes('busy')) return 'Busy';
    if (lower.includes('active')) return 'Active';
    if (lower.includes('offline')) return 'Offline';
    const firstWord = statusStr.split(':')[0].trim();
    return firstWord || 'Status';
}

function parseStatusMsg(statusStr) {
    if (!statusStr) return '';
    const idx = statusStr.indexOf(':');
    if (idx !== -1) {
        return statusStr.slice(idx + 1).trim();
    }
    return statusStr;
}

function getStatusPillClass(statusStr) {
    const mode = parseStatusMode(statusStr).toLowerCase().replace(/\s+/g, '');
    return 'pa-status-bg-' + mode;
}

function formatRelativeTime(dateStr) {
    const dt = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - dt.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return `${Math.floor(diffSec / 604800)}w ago`;
}

onMounted(() => {
    if (selectedUserId.value) {
        loadHistory();
    } else if (friendsList.value.length === 0) {
        // Auto demo preview if no friends found in context
        isDemoMode.value = true;
        selectFriend(MOCK_FRIENDS[0]);
    }
});
</script>

<style scoped>
.pa-container {
    position: relative;
    padding: 24px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: #0b0f19;
    color: #f8fafc;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    box-sizing: border-box;
}

/* Ambient Glow Backgrounds */
.pa-glow-bg {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    pointer-events: none;
    z-index: 0;
    opacity: 0.18;
}
.pa-glow-1 {
    top: -50px;
    left: -50px;
    width: 380px;
    height: 380px;
    background: radial-gradient(circle, #6366f1 0%, #a855f7 100%);
}
.pa-glow-2 {
    bottom: 40px;
    right: -60px;
    width: 420px;
    height: 420px;
    background: radial-gradient(circle, #06b6d4 0%, #ec4899 100%);
}

/* Header */
.pa-header {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    gap: 16px;
    flex-wrap: wrap;
    flex-shrink: 0;
}
.pa-header-title {
    display: flex;
    align-items: center;
    gap: 16px;
}
.pa-icon-wrapper {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
}
.pa-header-icon {
    font-size: 26px;
    color: #ffffff;
}
.pa-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
}
.pa-title {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
.pa-demo-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 20px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fbbf24;
    font-size: 11px;
    font-weight: 700;
}
.pa-subtitle {
    margin: 3px 0 0 0;
    font-size: 13px;
    color: #94a3b8;
}

/* Actions & Buttons */
.pa-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}
.pa-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.pa-btn-ghost {
    background: rgba(255, 255, 255, 0.05);
    color: #94a3b8;
    border-color: rgba(255, 255, 255, 0.08);
}
.pa-btn-ghost:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f8fafc;
}
.pa-btn-demo-active {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
    border-color: rgba(245, 158, 11, 0.4);
    box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
}
.pa-btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
    border-color: rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(10px);
}
.pa-btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-1px);
}
.pa-btn-primary {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
}
.pa-btn-primary:hover:not(:disabled) {
    opacity: 0.95;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
}

/* Search Section */
.pa-search-section {
    position: relative;
    z-index: 10;
    margin-bottom: 14px;
    flex-shrink: 0;
}
.pa-search-wrapper {
    display: flex;
    align-items: center;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 0 16px;
    transition: all 0.25s ease;
}
.pa-search-focused {
    border-color: #8b5cf6;
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.25);
    background: rgba(15, 23, 42, 0.85);
}
.pa-search-icon {
    font-size: 20px;
    color: #64748b;
    margin-right: 12px;
}
.pa-search-input {
    flex: 1;
    height: 46px;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 14px;
}
.pa-search-clear {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 18px;
    cursor: pointer;
    padding: 6px;
    border-radius: 50%;
    transition: background 0.15s ease;
}
.pa-search-clear:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
}

/* Dropdown */
.pa-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 14px;
    max-height: 320px;
    overflow-y: auto;
    z-index: 100;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    padding: 6px;
}
.pa-dropdown-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
}
.pa-dropdown-item:hover,
.pa-dropdown-item--selected {
    background: rgba(139, 92, 246, 0.22);
}
.pa-avatar-container {
    position: relative;
    width: 36px;
    height: 36px;
}
.pa-dropdown-avatar,
.pa-dropdown-avatar-placeholder {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
}
.pa-dropdown-avatar-placeholder {
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
}
.pa-status-dot-mini {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid #0f172a;
}
.pa-dropdown-info {
    flex: 1;
}
.pa-dropdown-name {
    font-weight: 600;
    font-size: 14px;
    color: #f1f5f9;
}
.pa-dropdown-id {
    font-size: 11px;
    color: #64748b;
    font-family: monospace;
}
.pa-dropdown-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
}

/* Quick Chips Selector */
.pa-quick-chips {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    z-index: 2;
    position: relative;
    flex-shrink: 0;
}
.pa-quick-label {
    font-size: 12px;
    color: #64748b;
    font-weight: 600;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
}
.pa-chips-scroll {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
    scroll-behavior: smooth;
}
.pa-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}
.pa-chip:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.18);
    transform: translateY(-1px);
}
.pa-chip--active {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%);
    border-color: #8b5cf6;
    color: #ffffff;
    font-weight: 700;
    box-shadow: 0 0 16px rgba(139, 92, 246, 0.25);
}
.pa-chip-avatar-wrap {
    position: relative;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
}
.pa-chip-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
}

/* Status Indicator Dots */
.pa-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    box-shadow: 0 0 8px currentColor;
}
.pa-status-active, .pa-status-bg-active { background-color: #22c55e; color: #22c55e; }
.pa-status-joinme, .pa-status-bg-joinme { background-color: #06b6d4; color: #06b6d4; }
.pa-status-askme, .pa-status-bg-askme { background-color: #f59e0b; color: #f59e0b; }
.pa-status-busy, .pa-status-bg-busy { background-color: #ef4444; color: #ef4444; }
.pa-status-offline, .pa-status-bg-offline { background-color: #64748b; color: #64748b; }

/* User Card */
.pa-user-card {
    position: relative;
    z-index: 2;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    padding: 20px;
    margin-bottom: 24px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    flex-shrink: 0;
}
.pa-user-card-glow {
    position: absolute;
    top: 0;
    right: 0;
    width: 240px;
    height: 240px;
    background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
    pointer-events: none;
}
.pa-user-card-body {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 18px;
    flex-wrap: wrap;
}
.pa-user-avatar-wrapper {
    position: relative;
}
.pa-user-avatar,
.pa-user-avatar-placeholder {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(139, 92, 246, 0.5);
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
}
.pa-user-avatar-placeholder {
    background: rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: #94a3b8;
}
.pa-status-ring-dot {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #0f172a;
}
.pa-user-details {
    flex: 1;
    min-width: 220px;
}
.pa-user-name-row {
    display: flex;
    align-items: center;
    gap: 12px;
}
.pa-user-name {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.01em;
}
.pa-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: capitalize;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
}
.pa-user-status-desc {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #cbd5e1;
    font-style: italic;
    margin-top: 4px;
}
.pa-user-id-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
}
.pa-user-id {
    font-size: 12px;
    color: #64748b;
    font-family: monospace;
}
.pa-icon-action-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 14px;
    padding: 2px;
    transition: color 0.15s ease;
}
.pa-icon-action-btn:hover {
    color: #ffffff;
}
.pa-link-btn {
    background: transparent;
    border: none;
    color: #8b5cf6;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.pa-link-btn:hover {
    text-decoration: underline;
    color: #a855f7;
}

/* Stats Counter Grid */
.pa-user-stats-grid {
    display: flex;
    gap: 10px;
}
.pa-stat-box {
    position: relative;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 10px 16px;
    border-radius: 12px;
    text-align: center;
    min-width: 90px;
    overflow: hidden;
}
.pa-stat-icon-bg {
    position: absolute;
    right: -6px;
    bottom: -6px;
    font-size: 32px;
    opacity: 0.08;
    pointer-events: none;
}
.pa-stat-num {
    display: block;
    font-size: 20px;
    font-weight: 800;
    color: #ffffff;
}
.pa-stat-primary .pa-stat-num { color: #8b5cf6; }
.pa-stat-emerald .pa-stat-num { color: #10b981; }
.pa-stat-purple .pa-stat-num { color: #d946ef; }
.pa-stat-label {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 600;
}

/* Filter Bar */
.pa-filter-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 14px;
    flex-wrap: wrap;
    gap: 12px;
}
.pa-filter-tabs {
    display: flex;
    gap: 6px;
}
.pa-filter-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}
.pa-filter-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.04);
}
.pa-filter-btn--active {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.18);
    color: #ffffff;
}
.pa-filter-right-controls {
    display: flex;
    align-items: center;
    gap: 12px;
}
.pa-text-filter-wrapper {
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 0 10px;
    height: 32px;
}
.pa-text-filter-icon {
    font-size: 14px;
    color: #64748b;
    margin-right: 6px;
}
.pa-text-filter-input {
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 12px;
    width: 130px;
}
.pa-sort-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: color 0.15s ease;
}
.pa-sort-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.05);
}

/* Timeline Wrapper */
.pa-timeline-wrapper {
    position: relative;
    z-index: 2;
    flex: 1;
    padding-top: 8px;
}

/* State Cards */
.pa-state-card {
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(12px);
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    padding: 48px 24px;
    text-align: center;
    color: #94a3b8;
    max-width: 520px;
    margin: 20px auto;
}
.pa-state-icon-wrap {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px auto;
}
.pa-state-icon {
    font-size: 32px;
    color: #8b5cf6;
}
.pa-state-card h3 {
    margin: 0 0 8px 0;
    color: #f1f5f9;
    font-size: 18px;
    font-weight: 700;
}
.pa-state-card p {
    font-size: 13px;
    line-height: 1.5;
    margin: 0 0 16px 0;
}
.pa-empty-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
}

.pa-spinner-glow {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(139, 92, 246, 0.2);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px auto;
    box-shadow: 0 0 16px rgba(139, 92, 246, 0.3);
}

/* Vertical Timeline Engine */
.pa-timeline {
    position: relative;
    padding-left: 36px;
}

/* Vertical Axis Animated Glow Line */
.pa-timeline::before {
    content: '';
    position: absolute;
    left: 14px;
    top: 14px;
    bottom: 14px;
    width: 3px;
    background: linear-gradient(180deg, #6366f1 0%, #a855f7 35%, #ec4899 70%, #10b981 100%);
    border-radius: 3px;
    box-shadow: 0 0 12px rgba(139, 92, 246, 0.4);
}

.pa-timeline-item {
    position: relative;
    margin-bottom: 24px;
}

/* Timeline Node Glowing Ring */
.pa-timeline-node {
    position: absolute;
    left: -36px;
    top: 16px;
    width: 31px;
    height: 31px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: #ffffff;
    z-index: 3;
    box-shadow: 0 0 16px rgba(0, 0, 0, 0.6);
    border: 2px solid #0f172a;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pa-timeline-item:hover .pa-timeline-node {
    transform: scale(1.18);
}
.pa-node-bio {
    background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
    box-shadow: 0 0 16px rgba(16, 185, 129, 0.5);
}
.pa-node-status {
    background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%);
    box-shadow: 0 0 16px rgba(139, 92, 246, 0.5);
}
.pa-node-profile {
    background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
    box-shadow: 0 0 16px rgba(245, 158, 11, 0.5);
}
.pa-node-snapshot {
    background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
    box-shadow: 0 0 16px rgba(59, 130, 246, 0.5);
}

/* Glassmorphic Card */
.pa-timeline-card {
    background: rgba(255, 255, 255, 0.035);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 18px 20px;
    transition: all 0.25s ease;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
.pa-timeline-card:hover {
    transform: translateX(6px);
    background: rgba(255, 255, 255, 0.055);
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.pa-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    gap: 10px;
}
.pa-card-type-row {
    display: flex;
    align-items: center;
    gap: 10px;
}
.pa-card-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #ffffff;
}
.pa-type-bio {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    box-shadow: 0 2px 10px rgba(16, 185, 129, 0.3);
}
.pa-type-status {
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    box-shadow: 0 2px 10px rgba(139, 92, 246, 0.3);
}
.pa-type-profile {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
}
.pa-type-snapshot {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}
.pa-card-name {
    font-weight: 700;
    font-size: 14px;
    color: #f1f5f9;
}
.pa-card-time-group {
    display: flex;
    align-items: center;
    gap: 10px;
}
.pa-relative-time {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    color: #a7f3d0;
}
.pa-card-time {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #94a3b8;
}

/* Card Content Sections */
.pa-card-section {
    margin-top: 14px;
}
.pa-section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.pa-copy-tiny-btn {
    margin-left: auto;
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 13px;
    transition: color 0.15s ease;
}
.pa-copy-tiny-btn:hover {
    color: #ffffff;
}

/* Status Content Box */
.pa-status-box {
    background: rgba(15, 23, 42, 0.6);
    border-radius: 12px;
    padding: 12px 14px;
    border-left: 4px solid #8b5cf6;
}
.pa-status-current-row {
    display: flex;
    align-items: center;
    gap: 10px;
}
.pa-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.08);
}
.pa-status-text {
    font-size: 14px;
    color: #f8fafc;
    font-weight: 600;
}

/* Delta / Previous Comparison Boxes */
.pa-delta-box {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
}
.pa-delta-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #64748b;
    font-weight: 700;
    margin-bottom: 4px;
}
.pa-prev-text {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #94a3b8;
}
.pa-status-pill-mini {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.06);
}

/* Bio Content Box */
.pa-bio-box {
    background: rgba(15, 23, 42, 0.6);
    border-radius: 12px;
    padding: 14px;
    border-left: 4px solid #10b981;
}
.pa-bio-content {
    font-size: 13.5px;
    color: #f1f5f9;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    font-family: inherit;
}
.pa-prev-bio-content {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12.5px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.2);
    padding: 8px 12px;
    border-radius: 8px;
    margin-top: 4px;
}

/* Vue Timeline Item Animations */
.pa-timeline-anim-enter-active,
.pa-timeline-anim-leave-active {
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.pa-timeline-anim-enter-from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
}
.pa-timeline-anim-leave-to {
    opacity: 0;
    transform: translateY(-20px) scale(0.96);
}

/* Utility Helpers */
.pa-text-success {
    color: #10b981 !important;
}
.pa-spin {
    animation: spin 1s linear infinite;
}
@keyframes spin {
    to { transform: rotate(360deg); }
}
</style>
