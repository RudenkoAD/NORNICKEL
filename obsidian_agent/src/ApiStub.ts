import { type KGResponse } from "./types";
import { LOG_CATEGORIES } from "./constants";

const MOCK_RESPONSES: Record<string, KGResponse> = {
  heat: {
    query: "",
    answer:
      "Найдено 2 исследования по термообработке Ni-Al сплавов. Оптимальная твёрдость достигается при 900°C, при 1000°C происходит рост зерна и снижение твёрдости.",
    entities: [
      {
        id: "mat_ni_al",
        type: "material",
        name: "Ni-6Al сплав",
        attributes: { composition: "6 wt% Al, balance Ni" },
        docRefs: ["ni_al_heat_treatment"],
      },
      {
        id: "eq_vf1200",
        type: "equipment",
        name: "Вакуумная печь VF-1200",
        attributes: { max_temp: "1200°C" },
        docRefs: ["ni_al_heat_treatment"],
      },
    ],
    relations: [
      {
        from: "mat_ni_al",
        to: "eq_vf1200",
        type: "tested_in",
        evidence: "ni_al_heat_treatment",
      },
    ],
    sources: [
      {
        doc_id: "ni_al_heat_treatment",
        title: "Ni-Al Alloy Heat Treatment Study (2023)",
        path: "corpus/ni_al_heat_treatment.md",
        excerpt:
          "Optimal hardness achieved at 900°C. At 1000°C, grain growth reduces hardness...",
        page: undefined,
        section: "Conclusion",
      },
    ],
    gaps: [
      {
        description:
          "Нет данных о влиянии скорости охлаждения на твёрдость Ni-Al при температурах > 850°C",
        relatedEntities: ["mat_ni_al"],
      },
    ],
  },

  corrosion: {
    query: "",
    answer:
      "По коррозионной стойкости Ti-6Al-4V найдено одно исследование в 3.5% NaCl. Скорость коррозии сильно зависит от температуры: 0.012 мм/год при 25°C против 0.045 мм/год при 60°C.",
    entities: [
      {
        id: "mat_ti64",
        type: "material",
        name: "Ti-6Al-4V",
        attributes: { surface: "Polished Ra 0.2 µm" },
        docRefs: ["ti_corrosion_test"],
      },
    ],
    relations: [],
    sources: [
      {
        doc_id: "ti_corrosion_test",
        title: "Ti Alloy Corrosion Resistance Experiment",
        path: "corpus/ti_corrosion_test.md",
        excerpt:
          "Corrosion rate at 25°C: 0.012 mm/year. Corrosion rate at 60°C: 0.045 mm/year.",
        page: undefined,
        section: "Results",
      },
    ],
    gaps: [
      {
        description:
          "Рекомендуются дополнительные тесты при 40°C и 50°C для уточнения температурной зависимости",
        relatedEntities: ["mat_ti64"],
      },
    ],
  },

  flotation: {
    query: "",
    answer:
      "По флотации сульфидной Ni-Cu руды найдено одно исследование влияния дозировки собирателя PAX. Оптимальный расход — 40 г/т, извлечение никеля 85.1%.",
    entities: [
      {
        id: "reagent_pax",
        type: "material",
        name: "PAX (собиратель)",
        attributes: { type: "potassium amyl xanthate" },
        docRefs: ["flotation_reagent_study"],
      },
      {
        id: "eq_denver",
        type: "equipment",
        name: "Denver D12 флотомашина",
        attributes: { cell_volume: "2L" },
        docRefs: ["flotation_reagent_study"],
      },
    ],
    relations: [
      {
        from: "reagent_pax",
        to: "eq_denver",
        type: "used_in",
        evidence: "flotation_reagent_study",
      },
    ],
    sources: [
      {
        doc_id: "flotation_reagent_study",
        title: "Flotation Reagent Study: Sulfide Ni-Cu Ore",
        path: "corpus/flotation_reagent_study.md",
        excerpt:
          "40 g/t PAX is the optimal dosage. At 60 g/t, recovery gain is marginal while selectivity decreases.",
        page: undefined,
        section: "Conclusion",
      },
    ],
    gaps: [
      {
        description:
          "Нет данных по влиянию pH на эффективность PAX при дозировках > 40 г/т",
        relatedEntities: ["reagent_pax"],
      },
    ],
  },

  multi: {
    query: "",
    answer:
      "По запросу найдено 3 исследования: термообработка Ni-Al, коррозия Ti-6Al-4V и флотация Ni-Cu руды. Ниже представлены все найденные источники и связи.",
    entities: [
      {
        id: "mat_ni_al",
        type: "material",
        name: "Ni-6Al сплав",
        attributes: { composition: "6 wt% Al, balance Ni" },
        docRefs: ["ni_al_heat_treatment"],
      },
      {
        id: "mat_ti64",
        type: "material",
        name: "Ti-6Al-4V",
        attributes: { surface: "Polished Ra 0.2 µm" },
        docRefs: ["ti_corrosion_test"],
      },
      {
        id: "reagent_pax",
        type: "material",
        name: "PAX (собиратель)",
        attributes: { type: "potassium amyl xanthate" },
        docRefs: ["flotation_reagent_study"],
      },
      {
        id: "eq_vf1200",
        type: "equipment",
        name: "Вакуумная печь VF-1200",
        attributes: { max_temp: "1200°C" },
        docRefs: ["ni_al_heat_treatment"],
      },
      {
        id: "eq_denver",
        type: "equipment",
        name: "Denver D12 флотомашина",
        attributes: { cell_volume: "2L" },
        docRefs: ["flotation_reagent_study"],
      },
    ],
    relations: [
      {
        from: "mat_ni_al",
        to: "eq_vf1200",
        type: "tested_in",
        evidence: "ni_al_heat_treatment",
      },
      {
        from: "reagent_pax",
        to: "eq_denver",
        type: "used_in",
        evidence: "flotation_reagent_study",
      },
    ],
    sources: [
      {
        doc_id: "ni_al_heat_treatment",
        title: "Ni-Al Alloy Heat Treatment Study (2023)",
        path: "corpus/ni_al_heat_treatment.md",
        excerpt:
          "Optimal hardness achieved at 900°C. At 1000°C, grain growth reduces hardness...",
        page: undefined,
        section: "Conclusion",
      },
      {
        doc_id: "ti_corrosion_test",
        title: "Ti Alloy Corrosion Resistance Experiment",
        path: "corpus/ti_corrosion_test.md",
        excerpt:
          "Corrosion rate at 25°C: 0.012 mm/year. Corrosion rate at 60°C: 0.045 mm/year.",
        page: undefined,
        section: "Results",
      },
      {
        doc_id: "flotation_reagent_study",
        title: "Flotation Reagent Study: Sulfide Ni-Cu Ore",
        path: "corpus/flotation_reagent_study.md",
        excerpt:
          "40 g/t PAX is the optimal dosage. At 60 g/t, recovery gain is marginal.",
        page: undefined,
        section: "Conclusion",
      },
    ],
    gaps: [
      {
        description:
          "Нет данных о влиянии скорости охлаждения на твёрдость Ni-Al при T > 850°C",
        relatedEntities: ["mat_ni_al"],
      },
      {
        description:
          "Рекомендуются тесты при 40°C и 50°C для Ti-6Al-4V",
        relatedEntities: ["mat_ti64"],
      },
      {
        description:
          "Нет данных по влиянию pH на эффективность PAX при дозировках > 40 г/т",
        relatedEntities: ["reagent_pax"],
      },
    ],
  },
};

function hashQuery(query: string): number {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    hash = ((hash << 5) - hash + query.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export class ApiStub {
  static async getResponse(query: string): Promise<KGResponse> {
    console.log(
      `${LOG_CATEGORIES.API_STUB} query received, length=${query.length}`,
    );

    const keys = Object.keys(MOCK_RESPONSES);
    const index = hashQuery(query) % keys.length;
    const selectedKey = keys[index];
    console.log(
      `${LOG_CATEGORIES.API_STUB} selected mock: ${selectedKey}`,
    );

    const response = MOCK_RESPONSES[selectedKey];
    response.query = query;

    console.log(
      `${LOG_CATEGORIES.API_STUB} response built: entities=${response.entities.length}, sources=${response.sources.length}, gaps=${response.gaps.length}`,
    );

    await ApiStub.delay(400 + Math.random() * 400);

    return response;
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
