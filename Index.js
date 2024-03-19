import JMapUtils from './JMapUtils.js'
import { Vector as VectorLayer } from "ol/layer";
import { Vector as VectorSource } from "ol/source";

class JMap extends JMapUtils {
  constructor(map) {
    super();
    this.map = map;
  }
  // 创建一个图层
  createLayer(name) {
    let layer = new VectorLayer({
      name: name,
      source: new VectorSource(),
    });
    this.map.addLayer(layer);
    return layer;
  }
}
export default JMap;