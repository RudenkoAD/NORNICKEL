export interface KGResponse {
  query: string;
  answer: string;
  entities: KGEntity[];
  relations: KGRelation[];
  sources: KGSource[];
  gaps: KGGap[];
}

export interface KGEntity {
  id: string;
  type: "material" | "experiment" | "property" | "regime" | "equipment" | "team" | "topic";
  name: string;
  attributes: Record<string, string>;
  docRefs: string[];
}

export interface KGRelation {
  from: string;
  to: string;
  type: string;
  evidence: string;
}

export interface KGSource {
  doc_id: string;
  title: string;
  path: string;
  excerpt: string;
  page?: number;
  section?: string;
}

export interface KGGap {
  description: string;
  relatedEntities: string[];
}
