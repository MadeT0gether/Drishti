# District Boundary Data — Source & Attribution

## Source

- **Dataset:** India district boundaries, Census 2011
- **Publisher:** DataMeet India community
- **Repository:** https://github.com/datameet/maps
- **Files used:** `Districts/Census_2011/2011_Dist.{shp,shx,dbf,prj}` (WGS-84 / EPSG:4326)
- **Retrieved:** 2026-08-25

## License

**CC BY 4.0.** The DataMeet maps repository states: "Unless explicitly stated,
all datasets in this repository is shared under CC BY 4.0 license. Please
mention and link to relevant dataset in the attribution."

**Required attribution (shown in the application map UI):**

> India boundaries by [DataMeet India community](https://github.com/datameet/maps) (CC BY 4.0)

## Extraction

`districts_census2011.geojson` contains exactly the 80 districts used by this
prototype (10 states × 8), extracted from the 641-district source by
state-scoped `(ST_NM, DISTRICT)` match, coordinates rounded to 5 decimals
(~1 m). Every district matched **exactly once**; no source feature was used
twice; geometry was not modified beyond coordinate rounding.

## Name alias mapping (our name → Census 2011 name)

| State | Our name | Census 2011 name | Note |
|---|---|---|---|
| Uttar Pradesh | Prayagraj | Allahabad | renamed 2018 |
| Karnataka | Bengaluru Urban | Bangalore | renamed 2014 |
| Karnataka | Mysuru | Mysore | renamed 2014 |
| Karnataka | Belagavi | Belgaum | renamed 2014 |
| Karnataka | Kalaburagi | Gulbarga | renamed 2014 |
| Karnataka | Shivamogga | Shimoga | renamed 2014 |
| Karnataka | Tumakuru | Tumkur | renamed 2014 |
| Gujarat | Ahmedabad | Ahmadabad | census transliteration |
| West Bengal | Howrah | Haora | census transliteration |
| West Bengal | Darjeeling | Darjiling | census transliteration |
| West Bengal | Hooghly | Hugli | census transliteration |
| West Bengal | Malda | Maldah | census transliteration |
| West Bengal | Purba Bardhaman | Barddhaman | see deviation below |

All other 67 districts matched by identical names within their state.
(State scoping matters: e.g. "Aurangabad" exists in both Maharashtra and
Bihar; only the Maharashtra polygon is used for our Aurangabad.)

## Known dataset-vintage deviations (documented, not corrected)

Boundaries are **as of Census 2011**. Districts bifurcated after 2011 are
represented by their undivided 2011 extent:

- **Purba Bardhaman (WB):** created 2017 from Barddhaman; the polygon shown is
  undivided Barddhaman (includes today's Paschim Bardhaman).
- Similar post-2011 carve-outs affect the outer extent of Rajkot, Jamnagar,
  Junagadh, Bhavnagar (Gujarat, 2013), Vellore and Tirunelveli (TN, 2019/2020),
  and Rewa (MP, 2023): the 2011 polygons include areas that are now separate
  districts.

This is acceptable for the synthetic prototype (its geography is stylized) and
is disclosed in the map UI as "Boundaries: Census 2011".
