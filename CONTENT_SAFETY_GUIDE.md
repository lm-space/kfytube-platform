# Content Safety System - KfyTube AI-Powered Filtering

## Overview

The Content Safety System uses **Cloudflare Workers AI** (Mistral 7B model) to automatically evaluate video suitability for children. This system helps filter out low-quality, inappropriate, or potentially unsafe content from being imported into KfyTube.

**Deployment Status:** ✅ Live as of 2026-02-13

## Key Features

### 1. AI-Powered Content Evaluation
- **Automatic Scoring:** Videos are scored 0-100 where 100 = perfectly safe for kids
- **Content Analysis:** AI evaluates:
  - Educational value
  - Age-appropriateness
  - Safety concerns (violence, inappropriate content, etc.)
  - Content type classification

### 2. Content Concerns Detection
The system identifies these red flags:
- 🚨 **Violence** - Fighting, dangerous activities
- 🚫 **Inappropriate Content** - Adult humor, inappropriate themes
- 😨 **Scary Content** - Disturbing or frightening themes
- 📉 **Low Educational Value** - Slime videos, ASMR, pick videos with no value
- ⛔ **Dangerous Activities** - DIY stunts, risky behavior
- 😠 **Mean Behavior** - Bullying or rudeness
- 📱 **Screen Time Focused** - Gaming streams, endless streaming
- 💰 **Consumerism-Focused** - Unboxing, buy-focused content

### 3. Safety Review Queue
- **Pending Review:** Videos awaiting manual confirmation of AI scoring
- **Approved:** Videos confirmed as suitable for kids
- **Rejected:** Videos marked as unsuitable

## Admin Interface

Access the Content Safety dashboard from KfyTube Admin at: **Content Safety** tab

### Dashboard Statistics
- **Total Videos:** Count of all videos in the queue
- **Pending Review:** Videos awaiting manual review
- **Approved:** Videos confirmed as safe
- **Rejected:** Videos marked as unsuitable
- **Average Safety Score:** Mean safety rating across all videos

### Filtering Options
1. **Status Filter:**
   - Pending (default)
   - Approved
   - Rejected

2. **Minimum Score Filter:**
   - All Scores (0+)
   - 20+
   - 40+
   - 60+
   - 80+

### Bulk Operations
1. **Select Videos:** Check boxes to select multiple videos
2. **Evaluate Selected:** Click to run AI evaluation on selected videos
3. **Individual Review:**
   - ✓ Approve - Mark as safe for kids
   - ✕ Reject - Mark as unsuitable

## API Endpoints

### Get Safety Queue
```
GET /api/safety/queue
?status=pending|approved|rejected
&minScore=0-100
&limit=50
&offset=0

Headers: Authorization: Bearer {token}
Response: { items: [], total: number, limit: number, offset: number }
```

### Evaluate Videos
```
POST /api/safety/evaluate
Headers: Authorization: Bearer {token}
Body: { video_ids: [1, 2, 3, ...] }

Response: {
  success: true,
  evaluated: number,
  failed: number,
  results: [
    {
      id: number,
      title: string,
      score: 0-100,
      concerns: ["concern1", "concern2"],
      reasoning: "explanation"
    }
  ]
}
```

### Review Video Safety
```
POST /api/safety/queue/{id}/review
Headers: Authorization: Bearer {token}
Body: { action: "approve" | "reject" }

Response: { success: true, video: {...} }
```

### Get Safety Statistics
```
GET /api/safety/stats
Headers: Authorization: Bearer {token}

Response: {
  total: number,
  pending: number,
  approved: number,
  rejected: number,
  avg_score: number,
  min_score: number,
  max_score: number
}
```

## Database Schema

### video_queue table (Updated)
```sql
-- Content Safety Columns:
kids_safety_score REAL              -- 0-100 score (NULL = not yet evaluated)
safety_review_status TEXT           -- 'pending', 'approved', 'rejected'
safety_concerns TEXT                -- JSON array of content concerns
reviewed_by_ai_at TEXT              -- Timestamp of AI evaluation

-- Indexes:
idx_video_queue_safety_score        -- For filtering by score
idx_video_queue_safety_status       -- For filtering by status
```

### Example Data
```json
{
  "id": 123,
  "youtube_video_id": "dQw4w9WgXcQ",
  "title": "How to Make Slime at Home",
  "kids_safety_score": 25,
  "safety_review_status": "pending",
  "safety_concerns": ["low_value", "repetitive"],
  "reviewed_by_ai_at": "2026-02-13T10:30:00Z"
}
```

## Score Interpretation Guide

| Score | Color | Meaning | Action |
|-------|-------|---------|--------|
| **80-100** | 🟢 Green | Excellent for kids | Auto-approve recommended |
| **60-79** | 🟡 Amber | Generally appropriate | Review recommended |
| **40-59** | 🔴 Red | Some concerns | Manual review required |
| **0-39** | 🟣 Dark Red | Not suitable | Likely reject |

## Implementation Details

### AI Scoring System

**Model:** Cloudflare Workers AI - Mistral 7B Instruct

**Input Analysis:**
1. Video title (primary signal)
2. Video description (contextual)
3. Channel information (context)

**Output Structure:**
```json
{
  "score": 75,
  "concerns": ["concern1", "concern2"],
  "reasoning": "Educational content about science with age-appropriate explanations"
}
```

### Real-Time Evaluation
- Videos are scored immediately when added to the queue
- No API key management needed (native Cloudflare binding)
- Latency: ~1-2 seconds per video
- Cost: Included in Cloudflare Workers plan

## Workflow Example

### 1. Video Discovery
- Channel videos are discovered automatically
- Added to `video_queue` with `safety_review_status = 'pending'`
- AI evaluation starts immediately

### 2. Admin Review
1. Open Content Safety tab in admin dashboard
2. Filter by "Pending" status
3. Review videos with low safety scores
4. Bulk evaluate additional videos as needed
5. Approve safe videos or reject unsuitable ones

### 3. Import Integration
- Approved videos can be imported to main catalog
- Rejected videos are skipped
- Pending videos remain in queue for manual decision

## Maintenance Tasks

### Regular Operations
1. **Daily:** Monitor pending videos count
2. **Weekly:** Review rejected videos for patterns
3. **Monthly:** Analyze safety score distributions

### Manual Adjustments
- Admin can manually adjust status of any video
- AI scores can be overridden by explicit approval/rejection
- Concerns can be updated manually if needed

## Troubleshooting

### Videos Not Evaluating
**Problem:** Videos stuck with NULL safety_score
**Solution:**
1. Check if AI binding is enabled in wrangler.json ✅
2. Click "Evaluate Selected" button
3. Check browser console for errors

### Low Accuracy
**Problem:** Scores seem incorrect for certain videos
**Solution:**
1. Try different minimum score filters
2. Remember AI is optimized for English titles
3. Non-English titles may get neutral scores (50)
4. Override with manual approval/rejection

### Performance Issues
**Problem:** Evaluation taking too long
**Solution:**
1. Evaluate videos in smaller batches (10-20 at a time)
2. AI processes sequentially to respect rate limits
3. Each video ~1-2 seconds

## Security & Privacy

- ✅ All evaluations use Cloudflare Workers native AI (no external API keys)
- ✅ No video content leaves Cloudflare infrastructure
- ✅ Admin-only access (requires authentication)
- ✅ All database interactions protected by auth checks
- ✅ Safe concerns stored as JSON (no PII)

## Future Enhancements

Potential improvements for future versions:
1. **Batch Processing:** Process multiple videos in parallel
2. **Custom Scoring Rules:** Allow admins to define custom concern types
3. **Appeals System:** Resubmit rejected videos for reconsideration
4. **Performance Analytics:** Track which content types are most often rejected
5. **Integration with Import Automation:** Auto-import only approved videos
6. **Multi-Language Support:** Evaluate titles in multiple languages

## Technical Stack

- **Frontend:** Svelte component (SafetyTab.svelte)
- **Backend:** Hono.js REST API
- **Database:** D1 SQLite
- **AI Model:** Cloudflare Workers AI (Mistral 7B)
- **Authentication:** Bearer token (admin only)

## Files & Locations

| Component | File Path |
|-----------|-----------|
| **AI Scoring Logic** | `backend/src/ai/content-safety.ts` |
| **API Endpoints** | `backend/src/index.ts` (lines ~3680+) |
| **Database Migration** | `backend/migrations/0016_add_content_safety_score.sql` |
| **Admin UI Component** | `frontend/src/components/Admin/SafetyTab.svelte` |
| **Dashboard Integration** | `frontend/src/components/Admin/Dashboard.svelte` |
| **Configuration** | `backend/wrangler.json` (AI binding) |

## Support

For issues or questions about the Content Safety System:
1. Check this guide
2. Review API error messages in browser console
3. Check Cloudflare worker logs via wrangler
4. Verify AI binding is enabled in wrangler.json

---

**Last Updated:** February 13, 2026
**Status:** ✅ Production Ready
**Deployment:** https://kfytube.rugan.workers.dev
