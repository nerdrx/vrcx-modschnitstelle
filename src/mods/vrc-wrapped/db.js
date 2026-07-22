// Database queries for the VRChat Wrapped dashboard

/**
 * Gets the top worlds visited by the user within a timeframe.
 */
export async function getTopWorlds(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // _feed_gps tracks location changes. 
    // We group by location and count. 
    // 'location' is usually the world ID or name in VRCX depending on the log type, 
    // but typically it contains the World Name as a string in standard GPS feed.
    const query = `
        SELECT world_name as worldName, COUNT(*) as visitCount
        FROM ${ctx.db.corePrefix()}_feed_gps
        WHERE created_at >= @timeThreshold AND world_name IS NOT NULL AND world_name != '' AND location != 'private'
        GROUP BY world_name
        ORDER BY visitCount DESC
        LIMIT @limit
    `;
    
    const rows = await ctx.db.query(query, { '@timeThreshold': timeThreshold, '@limit': limit });
    return rows.map(row => ({
        worldName: row[0],
        visitCount: row[1]
    }));
}

/**
 * Gets the most used avatars.
 */
export async function getTopAvatars(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // _feed_avatar tracks avatar changes
    const query = `
        SELECT avatar_name as avatarName, current_avatar_image_url as imageUrl, COUNT(*) as switchCount
        FROM ${ctx.db.corePrefix()}_feed_avatar
        WHERE created_at >= @timeThreshold AND avatar_name IS NOT NULL AND avatar_name != '' AND avatar_name != 'Loading...'
        GROUP BY avatar_name
        ORDER BY switchCount DESC
        LIMIT @limit
    `;
    
    const rows = await ctx.db.query(query, { '@timeThreshold': timeThreshold, '@limit': limit });
    return rows.map(row => ({
        avatarName: row[0],
        imageUrl: row[1],
        switchCount: row[2]
    }));
}

/**
 * Gets the top friends the user interacts with (based on online/offline overlap or instance joins).
 * For simplicity, we just look at who was seen online the most frequently or joins the same GPS instances.
 * Actually, VRCX has _feed_online_offline.
 */
export async function getTopFriends(ctx, days = 30, limit = 5) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // We count how many times a friend triggered an online/location event
    const query = `
        SELECT display_name as displayName, user_id as userId, COUNT(*) as interactionScore
        FROM ${ctx.db.corePrefix()}_feed_online_offline
        WHERE created_at >= @timeThreshold
        GROUP BY user_id
        ORDER BY interactionScore DESC
        LIMIT @limit
    `;
    
    const rows = await ctx.db.query(query, { '@timeThreshold': timeThreshold, '@limit': limit });
    return rows.map(row => ({
        displayName: row[0],
        userId: row[1],
        interactionScore: row[2]
    }));
}

/**
 * Gets an activity heatmap data (count of GPS changes per day).
 */
export async function getActivityHeatmap(ctx, days = 365) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // SQLite: substr(created_at, 1, 10) extracts 'YYYY-MM-DD'
    const query = `
        SELECT substr(created_at, 1, 10) as day, COUNT(*) as count
        FROM ${ctx.db.corePrefix()}_feed_gps
        WHERE created_at >= @timeThreshold
        GROUP BY day
        ORDER BY day ASC
    `;
    
    const rows = await ctx.db.query(query, { '@timeThreshold': timeThreshold });
    return rows.map(row => ({
        day: row[0],
        count: row[1]
    }));
}

/**
 * Gets aggregated summary metrics for the wrapped dashboard.
 */
export async function getSummaryMetrics(ctx, days = 30) {
    const timeThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const uniqueWorldsQuery = `SELECT COUNT(DISTINCT world_name) FROM ${ctx.db.corePrefix()}_feed_gps WHERE created_at >= @timeThreshold AND world_name IS NOT NULL AND world_name != ''`;
    const uniqueAvatarsQuery = `SELECT COUNT(DISTINCT avatar_name) FROM ${ctx.db.corePrefix()}_feed_avatar WHERE created_at >= @timeThreshold AND avatar_name IS NOT NULL AND avatar_name != '' AND avatar_name != 'Loading...'`;
    const interactionsQuery = `SELECT COUNT(*) FROM ${ctx.db.corePrefix()}_feed_online_offline WHERE created_at >= @timeThreshold`;

    const args = { '@timeThreshold': timeThreshold };
    const [worldsRow] = await ctx.db.query(uniqueWorldsQuery, args);
    const [avatarsRow] = await ctx.db.query(uniqueAvatarsQuery, args);
    const [interactionsRow] = await ctx.db.query(interactionsQuery, args);

    return {
        uniqueWorlds: worldsRow ? worldsRow[0] : 0,
        uniqueAvatars: avatarsRow ? avatarsRow[0] : 0,
        interactions: interactionsRow ? interactionsRow[0] : 0
    };
}
