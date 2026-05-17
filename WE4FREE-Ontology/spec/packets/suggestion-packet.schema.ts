// spec/packets/suggestion-packet.schema.ts

export interface SuggestionPacketSchema {
  packet_type: 'research_suggestion';
  target_lane: string;
  confidence: number;
  source_url: string;
  claim: string;
  why_it_matters: string;
  suggested_change: string;
  risk: 'low' | 'medium' | 'high';
  requires_human_review: boolean;
  created_at: string;
}

export const suggestionPacketSchemaJSON = {
  type: 'object',
  properties: {
    packet_type: { type: 'string', enum: ['research_suggestion'] },
    target_lane: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    source_url: { type: 'string', format: 'uri' },
    claim: { type: 'string' },
    why_it_matters: { type: 'string' },
    suggested_change: { type: 'string' },
    risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    requires_human_review: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['packet_type', 'target_lane', 'confidence', 'source_url', 'risk', 'requires_human_review'],
  additionalProperties: true, // SignedSuggestionPacket adds graph_confidence, signature, signing_key_id
};
