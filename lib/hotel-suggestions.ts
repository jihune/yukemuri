export type HotelSuggestion = {
  id: string;
  name: string;
  location: string;
  matchedName: string;
  similar: boolean;
};
export type SuggestionsResponse = { suggestions: HotelSuggestion[] };
