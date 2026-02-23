/**
 * Content Safety Scoring for Kids
 * Uses Cloudflare AI to evaluate video suitability for children
 */

export interface SafetyEvaluation {
    score: number;                    // 0-100, where 100 is perfectly safe for kids
    concerns: string[];               // List of content concerns found
    reasoning: string;                // Explanation of the score
}

/**
 * Evaluate video content suitability for kids
 * Returns a safety score (0-100) where 100 = safe, 0 = unsuitable
 */
export async function evaluateVideoSafetyForKids(
    videoTitle: string,
    videoDescription: string,
    aiBinding: any
): Promise<SafetyEvaluation> {
    console.log('[Content Safety] Evaluating video:', videoTitle);

    try {
        // Combine title and description for analysis
        const content = `Title: ${videoTitle}\n\nDescription: ${videoDescription?.substring(0, 500) || 'N/A'}`;

        const response = await aiBinding.run('@cf/mistral/mistral-7b-instruct-v0.1', {
            messages: [
                {
                    role: 'system',
                    content: `You are a content safety expert evaluating videos for children (ages 6-12).
Analyze video titles and descriptions to assess suitability for kids' content.

Identify these RED FLAGS that make content unsuitable:
- Violence or fighting content
- Inappropriate/adult humor
- Scary or disturbing themes
- Slime videos, scratch/pick videos, ASMR (low value for kids)
- Dangerous DIY/stunts
- Rude/mean behavior toward others
- Excessive screen time activities (gaming, streaming)
- Unboxing/consumerism focus
- Low educational value with clickbait

Identify these GOOD INDICATORS:
- Educational content (science, math, history, languages)
- Wholesome entertainment (stories, music, animation)
- Creative content (art, crafts, building)
- Physical activity / sports
- Nature / animals
- Positive life lessons

Respond with ONLY valid JSON (no markdown, no extra text):
{
  "score": <number 0-100>,
  "concerns": ["concern1", "concern2"],
  "reasoning": "<brief explanation>"
}

Examples:
- "How to make slime" -> score 20 (low educational value, repetitive)
- "Khan Academy Math Basics" -> score 95 (educational, age appropriate)
- "Family-friendly cartoon episode" -> score 90 (wholesome, entertaining)
- "Parkour stunts" -> score 30 (dangerous, not educational)`
                },
                {
                    role: 'user',
                    content: `Evaluate this video for kids content suitability:\n\n${content}`
                }
            ],
            temperature: 0.3,
            max_tokens: 300
        });

        // Parse response
        const responseText = response?.response || response?.result?.response;

        if (!responseText || typeof responseText !== 'string') {
            console.error('[Content Safety] Invalid response format:', JSON.stringify(response).substring(0, 200));
            // Return neutral score if AI fails
            return {
                score: 50,
                concerns: ['evaluation_error'],
                reasoning: 'Failed to evaluate content'
            };
        }

        try {
            // Try to extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('[Content Safety] No JSON found in response:', responseText.substring(0, 200));
                return {
                    score: 50,
                    concerns: ['parse_error'],
                    reasoning: 'Could not parse AI response'
                };
            }

            const evaluation = JSON.parse(jsonMatch[0]) as SafetyEvaluation;

            // Validate response
            if (typeof evaluation.score !== 'number' || evaluation.score < 0 || evaluation.score > 100) {
                evaluation.score = 50;
            }
            if (!Array.isArray(evaluation.concerns)) {
                evaluation.concerns = [];
            }
            if (typeof evaluation.reasoning !== 'string') {
                evaluation.reasoning = 'Unable to provide reasoning';
            }

            console.log('[Content Safety] ✅ Evaluation complete:', {
                title: videoTitle,
                score: evaluation.score,
                concerns: evaluation.concerns.length
            });

            return evaluation;
        } catch (parseErr: any) {
            console.error('[Content Safety] JSON parse error:', parseErr.message);
            console.error('[Content Safety] Raw response:', responseText.substring(0, 300));
            return {
                score: 50,
                concerns: ['parse_error'],
                reasoning: `Parse error: ${parseErr.message}`
            };
        }
    } catch (error: any) {
        console.error('[Content Safety] ❌ Evaluation error:', error.message);
        return {
            score: 50,
            concerns: ['api_error'],
            reasoning: `Error: ${error.message}`
        };
    }
}

/**
 * Batch evaluate multiple videos
 * Returns array of evaluations in the same order
 */
export async function batchEvaluateVideos(
    videos: Array<{ title: string; description?: string }>,
    aiBinding: any
): Promise<SafetyEvaluation[]> {
    console.log('[Content Safety] Batch evaluating', videos.length, 'videos');

    const results: SafetyEvaluation[] = [];

    for (const video of videos) {
        const evaluation = await evaluateVideoSafetyForKids(
            video.title,
            video.description || '',
            aiBinding
        );
        results.push(evaluation);
    }

    return results;
}
