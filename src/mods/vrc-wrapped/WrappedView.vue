<template>
    <div class="wrapped-dashboard-container">
        <WidgetHeader icon="ri-medal-line" title="VRChat Wrapped" />
        <div v-if="loading" class="loading-overlay">
            <i class="ri-loader-4-line ri-spin ri-3x"></i>
            <span>Crunching your VRChat data...</span>
        </div>
        
        <div v-else class="wrapped-content fade-in">
            <div class="wrapped-header">
                <h1>VRChat <span class="gradient-text">Wrapped</span></h1>
                <p>Your personal journey in the metaverse</p>
            </div>

            <div class="wrapped-controls">
                <el-select v-model="timeframe" placeholder="Select Timeframe" @change="loadData" class="timeframe-select">
                    <el-option label="Last 7 Days" :value="7"></el-option>
                    <el-option label="Last 30 Days" :value="30"></el-option>
                    <el-option label="Last 90 Days" :value="90"></el-option>
                    <el-option label="All Time (365 Days)" :value="365"></el-option>
                </el-select>
                <el-button @click="loadData" type="primary" :loading="loading" plain>
                    <i class="ri-refresh-line"></i> Refresh
                </el-button>
            </div>

            <!-- Summary Metrics -->
            <div class="summary-metrics">
                <div class="metric-card glass">
                    <i class="ri-global-line metric-icon"></i>
                    <div class="metric-info">
                        <span class="metric-value">{{ summaryMetrics.uniqueWorlds }}</span>
                        <span class="metric-label">Worlds Explored</span>
                    </div>
                </div>
                <div class="metric-card glass">
                    <i class="ri-group-line metric-icon"></i>
                    <div class="metric-info">
                        <span class="metric-value">{{ summaryMetrics.interactions }}</span>
                        <span class="metric-label">Interactions</span>
                    </div>
                </div>
                <div class="metric-card glass">
                    <i class="ri-user-smile-line metric-icon"></i>
                    <div class="metric-info">
                        <span class="metric-value">{{ summaryMetrics.uniqueAvatars }}</span>
                        <span class="metric-label">Avatars Used</span>
                    </div>
                </div>
            </div>

            <div class="wrapped-grid">
            <!-- Top Worlds -->
            <div class="wrapped-card top-worlds glass">
                <h3><i class="ri-global-line"></i> Top Worlds</h3>
                <div class="card-content">
                    <div v-for="(world, index) in topWorlds" :key="index" class="list-item">
                        <span class="rank">#{{ index + 1 }}</span>
                        <span class="name">{{ world.worldName || 'Unknown World' }}</span>
                        <span class="stat">{{ world.visitCount }} visits</span>
                    </div>
                    <div v-if="!topWorlds.length" class="empty-state">No world data found.</div>
                </div>
            </div>

            <!-- Top Friends -->
            <div class="wrapped-card top-friends glass">
                <h3><i class="ri-group-line"></i> Top Friends</h3>
                <div class="card-content">
                    <div v-for="(friend, index) in topFriends" :key="index" class="list-item">
                        <span class="rank">#{{ index + 1 }}</span>
                        <span class="name">{{ friend.displayName || 'Unknown Friend' }}</span>
                        <span class="stat">{{ friend.interactionScore }} interactions</span>
                    </div>
                    <div v-if="!topFriends.length" class="empty-state">No friend data found.</div>
                </div>
            </div>

            <!-- Top Avatars -->
            <div class="wrapped-card top-avatars glass">
                <h3><i class="ri-user-smile-line"></i> Top Avatars</h3>
                <div class="card-content">
                    <div v-for="(avatar, index) in topAvatars" :key="index" class="avatar-item">
                        <img :src="avatar.imageUrl || 'assets/images/default-avatar.png'" class="avatar-img" @error="handleImageError"/>
                        <div class="avatar-info">
                            <span class="name">{{ avatar.avatarName || 'Unknown Avatar' }}</span>
                            <span class="stat">{{ avatar.switchCount }} minutes used</span>
                        </div>
                    </div>
                    <div v-if="!topAvatars.length" class="empty-state">No avatar data found.</div>
                </div>
            </div>

            <!-- Activity Heatmap -->
            <div class="wrapped-card activity-heatmap glass full-width">
                <h3><i class="ri-calendar-event-line"></i> Activity Heatmap</h3>
                <div class="chart-container" ref="heatmapChart"></div>
            </div>
        </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, markRaw } from 'vue';
import * as echarts from 'echarts';
import * as db from './db.js';
import { getCtx } from './runtime';

const timeframe = ref(30);
const loading = ref(false);

const topWorlds = ref([]);
const topFriends = ref([]);
const topAvatars = ref([]);
const heatmapDataRaw = ref([]);
const summaryMetrics = ref({
    uniqueWorlds: 0,
    uniqueAvatars: 0,
    interactions: 0
});

const heatmapChart = ref(null);
let echartInstance = null;

const loadData = async () => {
    loading.value = true;
    try {
        const context = getCtx();
        if (!context) throw new Error('ModContext not found');

        // Execute queries in parallel
        const [worlds, friends, avatars, heatmap, summary] = await Promise.all([
            db.getTopWorlds(context, timeframe.value, 5),
            db.getTopFriends(context, timeframe.value, 5),
            db.getTopAvatars(context, timeframe.value, 5),
            db.getActivityHeatmap(context, timeframe.value),
            db.getSummaryMetrics(context, timeframe.value)
        ]);

        topWorlds.value = worlds;
        topFriends.value = friends;
        topAvatars.value = avatars;
        heatmapDataRaw.value = heatmap;
        summaryMetrics.value = summary;

        setTimeout(() => {
            renderHeatmap();
        }, 100);
    } catch (err) {
        console.error('[VRC Wrapped] Error loading data:', err);
    } finally {
        loading.value = false;
    }
};

const renderHeatmap = () => {
    if (!heatmapChart.value) return;

    if (!echartInstance) {
        echartInstance = markRaw(echarts.init(heatmapChart.value));
    }

    // Process heatmap data for ECharts calendar
    const data = heatmapDataRaw.value.map(row => [row.day, row.count]);
    
    // Determine the date range
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - timeframe.value);
    
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    const option = {
        tooltip: {
            position: 'top',
            formatter: function (p) {
                const format = echarts.format.formatTime('yyyy-MM-dd', p.data[0]);
                return format + ': ' + p.data[1] + ' activities';
            }
        },
        visualMap: {
            min: 0,
            max: 50, // Roughly 50 instance joins a day is a lot
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            inRange: {
                color: ['#1a1a24', '#7b2cbf', '#9d4edd', '#c77dff']
            },
            textStyle: { color: '#a0a0b0' }
        },
        calendar: [{
            range: [startDateStr, endDateStr],
            cellSize: ['auto', 20],
            itemStyle: {
                color: '#1e1e2d',
                borderWidth: 1,
                borderColor: '#2d2d3d'
            },
            yearLabel: { show: false },
            dayLabel: {
                firstDay: 1,
                nameMap: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                color: '#a0a0b0'
            },
            monthLabel: { color: '#a0a0b0' }
        }],
        series: [{
            type: 'heatmap',
            coordinateSystem: 'calendar',
            data: data
        }]
    };

    echartInstance.setOption(option);
};

const handleImageError = (e) => {
    e.target.src = 'assets/images/default-avatar.png'; // Fallback
};

const handleResize = () => {
    if (echartInstance) {
        echartInstance.resize();
    }
};

onMounted(() => {
    loadData();
    window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    if (echartInstance) {
        echartInstance.dispose();
    }
});
</script>

<style scoped>
.wrapped-dashboard-container {
    padding: 20px;
    height: 100%;
    overflow-y: auto;
    color: #e0e0e0;
}

.wrapped-header {
    margin-bottom: 30px;
    text-align: center;
}

.wrapped-header h1 {
    font-size: 2.5rem;
    font-weight: 800;
    margin: 0;
    color: #fff;
    letter-spacing: -0.5px;
}

.gradient-text {
    background: linear-gradient(90deg, #9d4edd, #ff007f);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.wrapped-header p {
    font-size: 1.1rem;
    color: #a0a0b0;
    margin-top: 5px;
}

.wrapped-controls {
    display: flex;
    gap: 15px;
    margin-bottom: 25px;
    align-items: center;
    justify-content: center;
}

.timeframe-select {
    width: 200px;
}

.loading-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: 15px;
    color: #9d4edd;
    font-size: 1.2rem;
}

.wrapped-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.summary-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 25px;
}

.metric-card {
    display: flex;
    align-items: center;
    padding: 20px;
    gap: 15px;
    background: linear-gradient(135deg, rgba(157, 78, 221, 0.05), rgba(0, 0, 0, 0.3));
    border: 1px solid rgba(157, 78, 221, 0.15);
    position: relative;
    overflow: hidden;
}

.metric-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #7b2cbf, #e0aaff);
    opacity: 0.7;
}

.metric-icon {
    font-size: 2.8rem;
    color: #c77dff;
    background: rgba(199, 125, 255, 0.1);
    padding: 12px;
    border-radius: 14px;
    box-shadow: inset 0 0 10px rgba(199, 125, 255, 0.05);
}

.metric-info {
    display: flex;
    flex-direction: column;
}

.metric-value {
    font-size: 2.2rem;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.1;
}

.metric-label {
    font-size: 0.85rem;
    color: #a0a0b0;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 4px;
}

.full-width {
    grid-column: 1 / -1;
}

/* Glassmorphism Styling */
.glass {
    background: rgba(30, 30, 45, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}

.wrapped-card {
    padding: 20px;
    display: flex;
    flex-direction: column;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.wrapped-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px 0 rgba(157, 78, 221, 0.15);
    border-color: rgba(157, 78, 221, 0.3);
}

.wrapped-card h3 {
    margin-top: 0;
    margin-bottom: 20px;
    font-size: 1.3rem;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 12px;
}

.wrapped-card h3 i {
    color: #c77dff;
}

.card-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.list-item, .avatar-item {
    display: flex;
    align-items: center;
    padding: 10px 15px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 10px;
    gap: 15px;
    transition: all 0.2s ease;
    border: 1px solid transparent;
}

.list-item:hover, .avatar-item:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateX(4px);
    border-color: rgba(157, 78, 221, 0.2);
}

.list-item .rank {
    font-weight: 800;
    color: #e0aaff;
    font-size: 1.2rem;
    min-width: 35px;
    text-shadow: 0 0 5px rgba(224, 170, 255, 0.3);
}

/* Special rank colors */
.list-item:nth-child(1) .rank { color: #ffd700; text-shadow: 0 0 10px rgba(255,215,0,0.5); }
.list-item:nth-child(2) .rank { color: #c0c0c0; text-shadow: 0 0 10px rgba(192,192,192,0.5); }
.list-item:nth-child(3) .rank { color: #cd7f32; text-shadow: 0 0 10px rgba(205,127,50,0.5); }

.list-item .name, .avatar-info .name {
    flex: 1;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.05rem;
    color: #f8f8f8;
}

.list-item .stat {
    font-size: 0.85rem;
    color: #e0aaff;
    background: rgba(157, 78, 221, 0.2);
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 500;
}

.avatar-img {
    width: 55px;
    height: 55px;
    border-radius: 10px;
    object-fit: cover;
    border: 2px solid rgba(157, 78, 221, 0.3);
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
}

.avatar-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
    flex: 1;
}

.avatar-info .stat {
    font-size: 0.85rem;
    color: #e0aaff;
    background: rgba(157, 78, 221, 0.15);
    padding: 3px 8px;
    border-radius: 4px;
    align-self: flex-start;
}

.empty-state {
    color: #a0a0b0;
    text-align: center;
    padding: 30px 0;
    font-style: italic;
    opacity: 0.7;
}

.chart-container {
    width: 100%;
    height: 250px;
}

/* Simple fade in animation */
.fade-in {
    animation: fadeIn 0.5s ease-in-out;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
</style>
