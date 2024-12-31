import { Map, View } from 'ol'
import { Vector as VectorLayer, Tile } from "ol/layer";
import { Vector as VectorSource, XYZ } from "ol/source";

class JMap {
  map: Map | undefined;
  projection: string;

  constructor(map?: Map) {
    this.map = map;
    this.projection = 'EPSG:4326';
  }
  initMap(target: string) {
    this.map = new Map({
      target,
      controls: [],
      layers: [
        new Tile({
          source: new XYZ({
            url: 'http://t0.tianditu.gov.cn/img_c/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=5e5949f7e96e8a136ef36a6594f18cdf',
            projection: this.projection,
          })
        })
      ],
      view: new View({
        center: [110, 40],
        zoom: 5,
        projection: this.projection,
      })
    });
    return this.map;
  }
  // 创建一个图层
  createLayer() {
    let layer = new VectorLayer({
      source: new VectorSource(),
    });
    this.map.addLayer(layer);
    return layer;
  }
}
export default JMap;