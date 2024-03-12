import * as turf from "@turf/turf";
import { WKT, GeoJSON } from "ol/format";
import Feature from "ol/Feature";
import { Polygon } from "ol/geom";
import { Message } from "element-ui";
let timer = 0
window.turf = turf;
class JMapUtils {
  constructor() {}
  /**
   * 平滑方法
   * @param coordinates 坐标
   * @param val 平滑数值 越大越平滑 0-1
   * @returns {*}
   */
  smoothFunc(coordinates, val = 0.85) {
    let line = turf.lineString(coordinates);
    let curved = turf.bezierSpline(line, {
      sharpness: val,
    });
    return curved;
  }

  /**
   * 根据图层name获取图层
   * @param names 要查询的name数组
   * @param isLike 是否模糊查询
   * @returns {*}
   */
  getLayersByName(names, isLike, map) {
    let currentMap = map || gisMap.map;
    let layers = [];
    if (isLike) {
      layers = currentMap.getLayers().array_.filter((layer) => {
        let is = false;
        let layerName = layer.values_.name + "";
        names.forEach((name) => {
          if (!is && layerName) {
            is = layerName.indexOf(name) !== -1;
          }
        });
        return is;
      });
    } else {
      layers = currentMap.getLayers().array_.filter((layer) => {
        return names.includes(layer.values_.name);
      });
    }
    return layers;
  }
  /**
   * 多边形获取要素的中心点
   * @param {import("@turf/turf").Feature} feature
   * @returns
   */
  getFeatureCenter(feature) {
    let geometry = feature.getGeometry();
    let coordinates = [];
    if (geometry.getType() === "MultiPolygon") {
      coordinates = geometry.getCoordinates()[0];
    } else if (geometry.getType() === "Polygon") {
      coordinates = geometry.getCoordinates();
    }
    let polygon = turf.polygon(coordinates);
    let center = turf.centerOfMass(polygon);
    return center.geometry.coordinates;
  }
  /**
   * 获取实体的缓冲区
   * @returns geojson
   */
  getFeatureBuffer(feature, bufferVal = 1) {
    let coord = feature.getGeometry().getCoordinates();
    let polygon = null;
    if(feature.getGeometry().getType() === 'MultiPolygon'){
      polygon = turf.multiPolygon(coord)
    } else {
      polygon = turf.polygon(coord)
    }
    var buffered = turf.buffer(polygon, bufferVal, { units: "miles" });
    return buffered;
  }
  // 将feature的经纬度转换为wkt格式
  featureToWKT(feature) {
    if (!feature) {
      return "";
    }
    let getGeometry = feature.getGeometry();
    // 解决Polygon类型时可能会首尾坐标不闭合的问题导致空间信息有误
    if (getGeometry.getType() === "Polygon") {
      let coordinates = getGeometry.getCoordinates();
      let startArr = coordinates[0][0];
      let startPoint = JSON.stringify(startArr);
      let endPoint = JSON.stringify(coordinates[0][coordinates[0].length - 1]);
      if (startPoint !== endPoint) {
        coordinates[0].push(startArr);
        feature = new Feature({
          geometry: new Polygon(coordinates),
        });
      }
    }
    const wkt = new WKT();
    let res = wkt.writeFeature(feature);
    return res;
  }
  // 判断一个feature1是否包含/相交feature2 type: 1.判断包含 2.判断相交
  isContains(feature1, feature2, type = 1) {
    let features1 = this.mTos(feature1);
    let features2 = this.mTos(feature2);
    let coords1 = this.getCoords(features1, type == 1 ? 0.001 : 0);
    let coords2 = this.getCoords(features2);
    let polygons = coords1.map((coord) => {
      return turf.polygon(coord);
    });
    let masks = coords2.map((coord) => {
      return turf.polygon(coord);
    });
    let is = false;
    polygons.forEach((polygon) => {
      masks.forEach((mask) => {
        let res = false;
        if (type == 1) {
          // 判断包含
          res = turf.booleanContains(polygon, mask);
        } else {
          let lines = turf.lineString(mask.geometry.coordinates[0]);
          // 判断相交
          res = turf.booleanCrosses(polygon, lines);
        }
        if (res) {
          is = true;
        }
      });
    });
    return is;
  }
  // 根据传入的一个点位和features判断这个点是否和他们的边相交
  isPintOnLine(features, point) {
    // 遍历要素，判断点是否在要素的几何形状上
    for (var i = 0; i < features.length; i++) {
      var geometry = features[i].getGeometry();
      let lineCoods = geometry.getCoordinates()[0];
      try {
        // 使用 Turf 判断点是否在几何形状上
        let isOn = turf.booleanPointOnLine(point, lineCoods, {
          ignoreEndVertices: false,
          epsilon: 1e-12,
        }); 
        if (isOn) {
          return features[i];
        }
      } catch (error) {
        return null;
      }
    }
    return null;
  }
  // 过小相邻的图斑进行合并
  littleMerge(features, minArea = 50) {
    features.forEach((item)=> {
      console.log(turf.area(item))
    })
    let smallFeatures = features.filter((feature)=>{
      let area = turf.area(feature)
      return area <= minArea
    })
    let bigFeatures = features.filter((feature)=>{
      let area = turf.area(feature)
      return area > minArea
    })
    // 如果没有过小图斑不做任何处理
    if(smallFeatures.length === 0) return features
    // 如果没有大图斑，直接返回空数组
    if(bigFeatures.length === 0) return []
    const merge = (smallFeatures, bigFeatures) => {
      let items = bigFeatures || smallFeatures
      smallFeatures.forEach((smallFeature)=>{
        let isOk = false
        items.forEach((feature, i)=>{
          if(JSON.stringify(smallFeature)!== JSON.stringify(feature) &&  !isOk){
            let isOverlap = turf.booleanOverlap(feature, smallFeature)
            if(isOverlap){
              isOk = true
              let union = turf.union(feature, smallFeature);
              if ((Date.now() - timer) >= 500) {
                setTimeout(()=>{
                  Message({
                    type: "warning",
                    message: `其中小于${minArea}平米的细斑已自动合并！`,
                  });
                }, 1)
                timer = Date.now()
              }
              console.log('合并:', union)
              items[i] = union
            }
          }
        })
      })
    }
    merge(smallFeatures)
    merge(smallFeatures, bigFeatures)
    return bigFeatures
  }
  // 根据经纬度添加popup弹窗
  addPopup(point, content) {
    let dom = document.getElementById("popup");
    // console.log(point, content, dom);
    if (dom) {
      if (point) {
        dom.style.display = "block";
      } else {
        dom.style.display = "none";
      }
    }
    if (this.popup.getElement()) {
      this.popup.getElement().innerHTML = content;
    }
    this.popup.setPosition(point);
    return this.popup;
  }
  getCoords(features, bufferVal) {
    let coords = [];
    features.forEach((feature) => {
      let coord;
      if (bufferVal) {
        let buffer = this.getFeatureBuffer(feature, bufferVal);
        coord = buffer.geometry.coordinates;
      } else {
        coord = feature.getGeometry().getCoordinates();
      }
      coords.push(coord);
    });
    return coords;
  }
  // 分解 将 MultiPolygon 转换成 多个Polygon
  mTos(feature) {
    let multiPolygon = feature || this.select.getFeatures().getArray()[0];
    if (
      !multiPolygon ||
      multiPolygon.getGeometry().getType() !== "MultiPolygon"
    ) {
      return [feature];
    }
    let coords = multiPolygon.getGeometry().getCoordinates();
    let newFeatures = [];
    for (let i = 0; i < coords.length; i++) {
      let polygonCoords = coords[i];
      let newFeature = new Feature({
        geometry: new Polygon(polygonCoords),
      });
      newFeatures.push(newFeature);
    }
    return newFeatures;
  }
  // 将geojson转换为wkt格式
  geojsonToWKT(geojson) {
    // 如果geojson是对象，转换为字符串
    let geojsonString =
      typeof geojson === "string" ? geojson : JSON.stringify(geojson);
    const geojsonFormat = new GeoJSON();
    const feature = geojsonFormat.readFeature(geojsonString);
    const wktFormat = new WKT();
    const wktString = wktFormat.writeFeature(feature);
    return wktString;
  }
}

export default JMapUtils;
