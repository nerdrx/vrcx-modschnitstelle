/**
 * Orbit Graph Engine & Helper Functions
 * Transforms friend data and store states into ECharts node/edge graph structures.
 */

export const CATEGORIES = [
    {
        name: 'Center',
        color: '#ec4899',
        icon: 'ri-user-star-line',
        label: 'You (Orbit Core)'
    },
    {
        name: 'VIP',
        color: '#a855f7',
        icon: 'ri-vip-crown-line',
        label: 'VIP / Favorites'
    },
    {
        name: 'Online',
        color: '#10b981',
        icon: 'ri-checkbox-blank-circle-fill',
        label: 'Online / In-Game'
    },
    {
        name: 'Active',
        color: '#06b6d4',
        icon: 'ri-pulse-line',
        label: 'Active Recently'
    },
    {
        name: 'Offline',
        color: '#64748b',
        icon: 'ri-moon-line',
        label: 'Offline'
    },
    {
        name: 'Groups',
        color: '#f59e0b',
        icon: 'ri-team-line',
        label: 'Groups / Communities'
    }
];

export const CATEGORY_MAP = CATEGORIES.reduce((acc, cat, idx) => {
    acc[cat.name] = { ...cat, index: idx };
    return acc;
}, {});

/**
 * Generates realistic mock graph dataset when store data is unavailable or empty.
 */
export function generateMockFriendsNetwork() {
    const centerNode = {
        id: 'usr_me',
        name: 'You (Orbit Core)',
        displayName: 'You (Orbit Core)',
        category: 0, // Center
        categoryName: 'Center',
        symbolSize: 45,
        value: 50,
        status: 'online',
        statusText: 'Exploring the Metaverse',
        location: 'The Black Cat ~ Instance #48102',
        avatarUrl: '',
        isCenter: true,
        itemStyle: {
            color: '#ec4899',
            borderColor: '#f472b6',
            borderWidth: 3,
            shadowBlur: 20,
            shadowColor: 'rgba(236, 72, 153, 0.6)'
        }
    };

    const mockFriends = [
        // VIPs
        {
            id: 'usr_1',
            displayName: 'Kira_VR',
            categoryName: 'VIP',
            status: 'online',
            location: 'Japan Shrine',
            bio: 'World Creator & Shader Dev'
        },
        {
            id: 'usr_2',
            displayName: 'AetherByte',
            categoryName: 'VIP',
            status: 'online',
            location: 'Chillout Lounge',
            bio: 'Audio Viz enthusiast'
        },
        {
            id: 'usr_3',
            displayName: 'Starlight_Fox',
            categoryName: 'VIP',
            status: 'active',
            location: 'VR Club Horizon',
            bio: 'Fullbody tracking addict'
        },
        {
            id: 'usr_4',
            displayName: 'Nova_Rider',
            categoryName: 'VIP',
            status: 'online',
            location: 'Midnight Rooftop',
            bio: 'Synthwave & Cyberpunk lover'
        },

        // Online / In-Game
        {
            id: 'usr_5',
            displayName: 'NeonValkyrie',
            categoryName: 'Online',
            status: 'online',
            location: 'The Black Cat',
            bio: 'VRChat DJ'
        },
        {
            id: 'usr_6',
            displayName: 'CyberChibi',
            categoryName: 'Online',
            status: 'online',
            location: 'The Black Cat',
            bio: 'Avatar artist'
        },
        {
            id: 'usr_7',
            displayName: 'CosmicPanda',
            categoryName: 'Online',
            status: 'online',
            location: 'Magic Academy',
            bio: 'Game World Explorer'
        },
        {
            id: 'usr_8',
            displayName: 'ZeroCool_VR',
            categoryName: 'Online',
            status: 'online',
            location: 'Murder Mystery 4',
            bio: 'Competitive gamer'
        },
        {
            id: 'usr_9',
            displayName: 'EchoChrono',
            categoryName: 'Online',
            status: 'online',
            location: 'Astral Observatory',
            bio: 'Space lover'
        },
        {
            id: 'usr_10',
            displayName: 'VoxelSamurai',
            categoryName: 'Online',
            status: 'online',
            location: 'Sword Art Realm',
            bio: 'Blender modeler'
        },

        // Active
        {
            id: 'usr_11',
            displayName: 'LunarEclipse',
            categoryName: 'Active',
            status: 'active',
            location: 'Offline',
            bio: 'Community Host'
        },
        {
            id: 'usr_12',
            displayName: 'PixelMaestro',
            categoryName: 'Active',
            status: 'active',
            location: 'Offline',
            bio: 'Udon C# Dev'
        },
        {
            id: 'usr_13',
            displayName: 'Solaris99',
            categoryName: 'Active',
            status: 'active',
            location: 'Offline',
            bio: 'Casual VR gamer'
        },
        {
            id: 'usr_14',
            displayName: 'GlitchCat',
            categoryName: 'Active',
            status: 'active',
            location: 'Offline',
            bio: 'OSC integrations'
        },
        {
            id: 'usr_15',
            displayName: 'VortexDrifter',
            categoryName: 'Active',
            status: 'active',
            location: 'Offline',
            bio: 'Racing map speedrunner'
        },
        {
            id: 'usr_16',
            displayName: 'Nyx_Shadow',
            categoryName: 'Active',
            status: 'active',
            location: 'Offline',
            bio: 'Night owl'
        },

        // Offline
        {
            id: 'usr_17',
            displayName: 'Astraea',
            categoryName: 'Offline',
            status: 'offline',
            location: 'Offline',
            bio: 'VRC Veteran'
        },
        {
            id: 'usr_18',
            displayName: 'RiftWalker',
            categoryName: 'Offline',
            status: 'offline',
            location: 'Offline',
            bio: 'Map architect'
        },
        {
            id: 'usr_19',
            displayName: 'ZenithZero',
            categoryName: 'Offline',
            status: 'offline',
            location: 'Offline',
            bio: 'Streamer'
        },
        {
            id: 'usr_20',
            displayName: 'NebulaDreamer',
            categoryName: 'Offline',
            status: 'offline',
            location: 'Offline',
            bio: 'Sleep world enjoyer'
        },
        {
            id: 'usr_21',
            displayName: 'Hydra_X',
            categoryName: 'Offline',
            status: 'offline',
            location: 'Offline',
            bio: 'Tech tinkerer'
        },
        {
            id: 'usr_22',
            displayName: 'ObsidianPulse',
            categoryName: 'Offline',
            status: 'offline',
            location: 'Offline',
            bio: 'Music producer'
        },

        // Groups / Hubs
        {
            id: 'grp_1',
            displayName: 'Creators Hub',
            categoryName: 'Groups',
            status: 'group',
            location: 'Community Group',
            bio: 'VRC World & Avatar Creators'
        },
        {
            id: 'grp_2',
            displayName: 'DJ Lounge',
            categoryName: 'Groups',
            status: 'group',
            location: 'Community Group',
            bio: 'Live music & rave events'
        },
        {
            id: 'grp_3',
            displayName: 'Night Owls',
            categoryName: 'Groups',
            status: 'group',
            location: 'Community Group',
            bio: 'Late night hangout group'
        }
    ];

    const nodes = [centerNode];
    const links = [];

    mockFriends.forEach((f, idx) => {
        const catInfo = CATEGORY_MAP[f.categoryName] || CATEGORY_MAP['Offline'];
        const isGroup = f.categoryName === 'Groups';
        const symbolSize = isGroup
            ? 36
            : f.categoryName === 'VIP'
              ? 32
              : f.status === 'online'
                ? 26
                : 22;

        nodes.push({
            id: f.id,
            name: f.displayName,
            displayName: f.displayName,
            category: catInfo.index,
            categoryName: f.categoryName,
            symbolSize: symbolSize,
            value: symbolSize,
            status: f.status,
            statusText:
                f.status === 'online'
                    ? 'Online'
                    : f.status === 'active'
                      ? 'Active Recently'
                      : isGroup
                        ? 'Group Node'
                        : 'Offline',
            location: f.location,
            bio: f.bio,
            isCenter: false,
            itemStyle: {
                color: catInfo.color,
                shadowBlur:
                    f.categoryName === 'VIP' || f.status === 'online' ? 12 : 4,
                shadowColor: catInfo.color
            }
        });

        // Link center to all friends/groups
        links.push({
            source: centerNode.id,
            target: f.id,
            value: f.categoryName === 'VIP' ? 3 : 1,
            lineStyle: {
                width: f.categoryName === 'VIP' ? 2.5 : 1,
                opacity: f.categoryName === 'VIP' ? 0.8 : 0.4
            }
        });
    });

    // Inter-friend connections (cluster links for community feeling)
    const extraConnections = [
        ['usr_1', 'usr_2'],
        ['usr_1', 'usr_3'],
        ['usr_2', 'usr_4'],
        ['usr_5', 'usr_6'],
        ['usr_5', 'usr_7'],
        ['usr_6', 'usr_8'],
        ['usr_1', 'grp_1'],
        ['usr_12', 'grp_1'],
        ['usr_10', 'grp_1'],
        ['usr_5', 'grp_2'],
        ['usr_22', 'grp_2'],
        ['usr_2', 'grp_2'],
        ['usr_16', 'grp_3'],
        ['usr_4', 'grp_3'],
        ['usr_20', 'grp_3'],
        ['usr_7', 'usr_9'],
        ['usr_11', 'usr_13'],
        ['usr_14', 'usr_15']
    ];

    extraConnections.forEach(([src, tgt]) => {
        links.push({
            source: src,
            target: tgt,
            value: 1,
            lineStyle: {
                width: 1,
                opacity: 0.3,
                type: 'dashed'
            }
        });
    });

    return {
        nodes,
        links,
        categories: CATEGORIES.map((c) => ({ name: c.name }))
    };
}

/**
 * Builds nodes and links from real Pinia store data.
 */
export function buildGraphFromFriends(friendsMap, currentUser) {
    const userName = currentUser?.displayName || 'You (Orbit Core)';
    const userAvatar =
        currentUser?.currentAvatarThumbnailImageUrl ||
        currentUser?.currentAvatarImageUrl ||
        '';

    const centerNode = {
        id: currentUser?.id || 'usr_me',
        name: userName,
        displayName: userName,
        category: 0,
        categoryName: 'Center',
        symbolSize: 45,
        value: 50,
        status: 'online',
        statusText: 'Orbit Center',
        location: currentUser?.locationName || 'Online',
        avatarUrl: userAvatar,
        isCenter: true,
        itemStyle: {
            color: '#ec4899',
            borderColor: '#f472b6',
            borderWidth: 3,
            shadowBlur: 20,
            shadowColor: 'rgba(236, 72, 153, 0.6)'
        }
    };

    if (!friendsMap || !(friendsMap instanceof Map) || friendsMap.size === 0) {
        return null;
    }

    const nodes = [centerNode];
    const links = [];
    const locationClusters = new Map(); // group friends in same location

    friendsMap.forEach((friend, friendId) => {
        const name = friend.name || friend.displayName || friend.username || friendId;
        const isFavorite = Boolean(friend.isFavorite || friend.favorite);
        const isOnline =
            friend.state === 'online' ||
            friend.status === 'online' ||
            friend.status === 'join me' ||
            friend.status === 'active';
        const isActive =
            friend.state === 'active' ||
            friend.status === 'ask me' ||
            friend.status === 'busy';

        let categoryName = 'Offline';
        if (isFavorite) {
            categoryName = 'VIP';
        } else if (isOnline) {
            categoryName = 'Online';
        } else if (isActive) {
            categoryName = 'Active';
        }

        const catInfo = CATEGORY_MAP[categoryName] || CATEGORY_MAP['Offline'];
        const symbolSize = isFavorite ? 32 : isOnline ? 26 : 22;
        const loc = friend.location || friend.locationName || 'Offline';

        nodes.push({
            id: friendId,
            name: name,
            displayName: name,
            category: catInfo.index,
            categoryName,
            symbolSize,
            value: symbolSize,
            status: friend.status || (isOnline ? 'online' : 'offline'),
            statusText:
                friend.statusDescription || friend.status || categoryName,
            location: loc,
            bio: friend.bio || '',
            avatarUrl:
                friend.currentAvatarThumbnailImageUrl ||
                friend.userIcon ||
                friend.icon ||
                '',
            isCenter: false,
            itemStyle: {
                color: catInfo.color,
                shadowBlur: isFavorite || isOnline ? 12 : 4,
                shadowColor: catInfo.color
            }
        });

        // Link center to friend
        links.push({
            source: centerNode.id,
            target: friendId,
            value: isFavorite ? 3 : 1,
            lineStyle: {
                width: isFavorite ? 2.5 : 1,
                opacity: isFavorite ? 0.8 : 0.4
            }
        });

        // Track location for clustering links
        if (loc && loc !== 'Offline' && loc !== 'private') {
            if (!locationClusters.has(loc)) {
                locationClusters.set(loc, []);
            }
            locationClusters.get(loc).push(friendId);
        }
    });

    // Create links between friends in the same location
    locationClusters.forEach((friendIds) => {
        if (friendIds.length > 1) {
            for (let i = 0; i < friendIds.length; i++) {
                for (let j = i + 1; j < friendIds.length; j++) {
                    links.push({
                        source: friendIds[i],
                        target: friendIds[j],
                        value: 1,
                        lineStyle: {
                            width: 1,
                            opacity: 0.5,
                            type: 'dashed'
                        }
                    });
                }
            }
        }
    });

    return {
        nodes,
        links,
        categories: CATEGORIES.map((c) => ({ name: c.name }))
    };
}

/**
 * Filters nodes and links based on search query and category selections.
 */
export function filterGraphData(
    graphData,
    searchQuery = '',
    selectedCategories = []
) {
    if (!graphData) return { nodes: [], links: [], categories: [] };

    const query = searchQuery.trim().toLowerCase();
    const hasCategoryFilter =
        selectedCategories && selectedCategories.length > 0;

    // Filter nodes
    const visibleNodes = graphData.nodes.filter((node) => {
        if (node.isCenter) return true; // Center node always visible

        const matchesCategory =
            !hasCategoryFilter ||
            selectedCategories.includes(node.categoryName);
        const matchesQuery =
            !query ||
            (node.displayName &&
                node.displayName.toLowerCase().includes(query)) ||
            (node.location && node.location.toLowerCase().includes(query)) ||
            (node.bio && node.bio.toLowerCase().includes(query));

        return matchesCategory && matchesQuery;
    });

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    // Filter links where both source and target exist
    const visibleLinks = graphData.links.filter((link) => {
        const src =
            typeof link.source === 'object' ? link.source.id : link.source;
        const tgt =
            typeof link.target === 'object' ? link.target.id : link.target;
        return visibleNodeIds.has(src) && visibleNodeIds.has(tgt);
    });

    return {
        nodes: visibleNodes,
        links: visibleLinks,
        categories: graphData.categories
    };
}

/**
 * Computes network metrics for stats panel.
 */
export function computeNetworkMetrics(graphData) {
    if (!graphData || !graphData.nodes) {
        return {
            totalFriends: 0,
            onlineCount: 0,
            vipCount: 0,
            connectionsCount: 0,
            densityPercent: 0
        };
    }

    const nonCenterNodes = graphData.nodes.filter((n) => !n.isCenter);
    const totalFriends = nonCenterNodes.length;
    const onlineCount = nonCenterNodes.filter(
        (n) => n.categoryName === 'Online' || n.status === 'online'
    ).length;
    const vipCount = nonCenterNodes.filter(
        (n) => n.categoryName === 'VIP'
    ).length;
    const connectionsCount = graphData.links ? graphData.links.length : 0;

    // Max possible links in undirected graph: N * (N - 1) / 2
    const maxPossible =
        totalFriends > 1 ? (totalFriends * (totalFriends - 1)) / 2 : 1;
    const densityPercent = Math.min(
        100,
        Math.round((connectionsCount / maxPossible) * 100)
    );

    return {
        totalFriends,
        onlineCount,
        vipCount,
        connectionsCount,
        densityPercent
    };
}
