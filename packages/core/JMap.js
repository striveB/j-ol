import { Message } from "element-ui";
import datas from "./test";
import proj4 from "proj4";
import wmtsTileLoadFunction from "./cacheTile";
import JMapUtils from "./JMapUtils";
import * as turf from "@turf/turf";
import { Collection, getProjection } from "ol";
import { Vector as VectorLayer, Tile, Image } from "ol/layer";
import {
  Vector as VectorSource,
  XYZ,
  ImageWMS,
  WMTS,
  TileWMS,
} from "ol/source";
import WMTSTileGrid from "ol/tilegrid/WMTS";
import { getVectorContext } from "ol/render";
import { register } from "ol/proj/proj4";
import {
  get,
  createProjection,
  fromLonLat,
  Projection,
  addProjection,
} from "ol/proj";
import { Translate, Select, Modify, Snap } from "ol/interaction";
import { click } from "ol/events/condition";
import Draw, { createBox } from "ol/interaction/Draw";
import Feature from "ol/Feature";
import View from "ol/View";
import { fromExtent, fromCircle } from "ol/geom/Polygon";
import Overlay from "ol/Overlay";
import {
  Point,
  LineString,
  Polygon,
  MultiPolygon,
  Circle,
  Geometry,
  LinearRing,
  Circle as CircleGeom,
} from "ol/geom";
import {
  Style,
  Fill,
  Text,
  Stroke,
  Circle as StyleCircle,
  Icon,
  RegularShape,
} from "ol/style";
import { GeoJSON, WKT } from "ol/format";

import axios from "axios";
import yxParams from "./yxHelp";
let newToken = encodeURIComponent(
  // "dNqHK8nygbLMXhXsvfCJeKzkR2-ULtnLOm6ez9SGQvpGWsKPU37zBhxHOetsmy7LuZA3DHrRWBgwNVIexAO3k0TMvxRVcFRFg_QCtRukryA."
  "bIWpABsi3FzjFBl7ZybAoiZmIBLLOFJ80uplrxuVJ5vQrrhON1y1VhNRDOr84bjB"
  // "dNqHK8nygbLMXhXsvfCJeFDWIPOAY3YnmPFkJDgtDzJH9EYaS4XrzVt2J62UmicxPi2Mp-48hZ2QJXLG2JdO0QWeo1GchV4U1sY9_Rj4Ah0."
);
class JMap extends JMapUtils {
  constructor(map) {
    super();
    this.map = map || gisMap.map;
    this.history = [];
    this.backHistory = [];
    this.editLayer = this.createLayer(null, "图斑编辑图层");
    this.editStyle = this.createStyle({
      fillColor: "rgba(255, 85, 85, .5)",
      borderColor: "rgba(255, 85, 85, 1)",
    });
    this.selectStyle = this.createStyle({
      fillColor: "rgba(13, 149, 211, .5)",
      borderColor: "rgb(13, 149, 211)",
    });
    // 督查模块图层样式
    this.dctbStyle = this.createStyle({
      fillColor: "rgba(0, 0, 0, 0)",
      borderColor: "#75F9F8",
    });
    document.addEventListener("keydown", (e) => {
      if (!this.currentLayer) {
        return;
      }
      if (
        (e.code === "KeyZ" && e.shiftKey && e.metaKey) ||
        (e.code === "KeyZ" && e.shiftKey && e.ctrlKey)
      ) {
        this.rollback("x");
        return;
      }
      if (
        (e.code === "KeyZ" && e.metaKey) ||
        (e.code === "KeyZ" && e.ctrlKey)
      ) {
        this.rollback();
      }
    });
    this.initPopup();
    // 点追踪专用图层
    this.pointLineLayer = this.createLayer(null, "追踪专用图层");
    this.use4490();
  }
  use4490() {
    proj4.defs(
      "EPSG:4490",
      'GEOGCS["China Geodetic Coordinate System 2000",DATUM["China_2000",SPHEROID["CGCS2000",6378137,298.257222101,AUTHORITY["EPSG","1024"]],AUTHORITY["EPSG","1043"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4490"]]'
    );
    register(proj4);
    //重写projection4490，
    var projection = new Projection({
      code: "EPSG:4490",
      units: "degrees",
      axisOrientation: "neu",
    });
    projection.setExtent([-180, -90, 180, 90]);
    projection.setWorldExtent([-180, -90, 180, 90]);
    addProjection(projection);
  }
  initPopup() {
    // 检查是否已经存在 popup 元素
    var existingPopup = document.getElementById("popup");

    if (!existingPopup) {
      // 创建 div 元素
      var popupDiv = document.createElement("div");
      popupDiv.id = "popup";
      popupDiv.className = "ol-popup";

      var popupContentDiv = document.createElement("div");
      popupContentDiv.id = "popup-content";

      popupDiv.appendChild(popupContentDiv);

      // 将创建的元素添加到 body 中
      document.body.appendChild(popupDiv);
    }
    this.popup = new Overlay({
      element: document.getElementById("popup"),
      positioning: "bottom-center",
      stopEvent: false,
    });
    this.map.addOverlay(this.popup);
  }
  // 根据feature裁剪图层
  cjLayer(layer, feature) {
    layer.on("prerender", (event) => {
      let vectorContext = getVectorContext(event);
      event.context.globalCompositeOperation = "source-over";
      let ctx = event.context;
      ctx.save();
      vectorContext.drawFeature(
        feature,
        new Style({
          stroke: new Stroke({
            color: "rgba(0, 255, 255, 0)", // 边框颜色
            width: 3,
          }),
        })
      ); // 可以对边界设置一个样式
      ctx.clip();
    });
    layer.on("postrender", (event) => {
      let ctx = event.context;
      ctx.restore();
    });
    layer.setExtent(feature.getGeometry().getExtent());
  }

  // 重置裁剪过得图层
  clearCj(layer) {
    layer.on("prerender", (event) => {
      let ctx = event.context;
      ctx.restore();
    });
    layer.setExtent();
  }
  // 添加遮罩
  createShade() {
    // 遮罩样式
    const shadeStyle = new Style({
      fill: new Fill({
        color: "rgba(0, 0, 0, 0.6)",
      }),
      stroke: new Stroke({
        width: 1,
        color: "#ccc",
      }),
    });
    // 遮罩数据源
    const vtSource = new VectorSource();
    // 遮罩图层
    const vtLayer = new VectorLayer({
      name: "遮罩层",
      source: vtSource,
      style: shadeStyle,
    });
    var that = this;
    that.map.addLayer(vtLayer);

    /**
     * 添加遮罩
     * @param {LineString | MultiLineString | Polygon | MultiPolygon} geom 必选参数
     * @param { View } view 必选参数
     * @param { String } dataProjection geom的坐标系,只支持epsg:4326 || epsg:3857, 可选参数, 当地图的坐标系与遮罩数据的坐标系不一致时，需求提供数据的坐标系
     * @returns { Feature }
     */
    function createShade(geom, view, dataProjection) {
      if (geom instanceof Geometry) {
        dataProjection = dataProjection.toUpperCase();
        const source = geom.clone();
        if (
          ["EPSG:4326", "EPSG:3857"].includes(dataProjection) &&
          view instanceof View
        ) {
          const projection = createProjection(dataProjection);
          const mapProjection = view.getProjection();
          const mapProjetionCode = mapProjection.getCode();
          if (
            projection.getCode() !== mapProjetionCode &&
            ["EPSG:4326", "EPSG:3857"].includes(mapProjetionCode)
          ) {
            source.transform(projection, mapProjection);
          }
        }

        var polygon = erase(source, view);
        var feature = new Feature({
          geometry: polygon,
        });
        return {
          feature,
          shade: source,
        };
      }
    }

    /**
     * 擦除操作
     * @param {LineString | MultiLineString | Polygon | MultiPolygon} geom 必选参数
     * @param { View } view 必选参数
     * @returns {Polygon}
     */
    function erase(geom, view) {
      var part = getCoordsGroup(geom);
      if (!part) {
        return;
      }
      var extent = view.getProjection().getExtent();
      var polygonRing = fromExtent(extent);
      part.forEach((item) => {
        let linearRing = new LinearRing(item);
        polygonRing.appendLinearRing(linearRing);
      });
      return polygonRing;
    }

    /**
     * geom转坐标数组
     * @param {LineString | MultiLineString | Polygon | MultiPolygon} geom
     * @returns {Array<Array<import("ol/coordinate").Coordinate>>} 返回geom中的坐标
     */
    function getCoordsGroup(geom) {
      var group = []; //
      var geomType = geom.getType();
      if (geomType === "LineString") {
        group.push(geom.getCoordinates());
      } else if (geomType === "MultiLineString") {
        group = geom.getCoordinates();
      } else if (geomType === "Polygon") {
        group = geom.getCoordinates();
      } else if (geomType === "MultiPolygon") {
        geom.getPolygons().forEach((poly) => {
          var coords = poly.getCoordinates();
          group = group.concat(coords);
        });
      } else {
        console.log("暂时不支持的类型");
      }
      return group;
    }

    function testAddShade() {
      const data = require("./map-config/hn.json");
      const features = new GeoJSON().readFeatures(data);
      const ft = features[0];
      const bound = ft.getGeometry();
      const result = createShade(bound, that.map.getView(), "epsg:4326");
      if (result) {
        vtSource.addFeature(result.feature);
        // that.map.getView().fit(result.shade);
      }
    }
    testAddShade();
  }
  // 添加影像
  createLayerYx(url, name, map, token) {
    const source = new WMTS({
      attributions:
        'Tiles © <a href="https://mrdata.usgs.gov/geology/state/"' +
        ' target="_blank">USGS</a>',
      url: `${url}?st=${window.yunyaoMapToken["security-token"]}&xt=${window.yunyaoMapToken["x-gistack-token"]}`,
      matrixSet: "EPSG:3857",
      format: "image/png",
      projection: yxParams.projection,
      tileGrid: new WMTSTileGrid({
        origin: yxParams.origin,
        resolutions: yxParams.resolutions,
        matrixIds: yxParams.matrixIds,
      }),
      style: "default",
      wrapX: true,
    });
    const layer = new Tile({
      preload: Infinity,
      name,
      title: "测试标题",
      zIndex: 0,
      source,
    });
    if (map) {
      map.addLayer(layer);
    } else {
      this.map.addLayer(layer);
    }
    return layer;
  }
  // 加载服务
  createLayerByUrl(url, name, params = {}) {
    let tokenStr = "";
    let index = url.indexOf("?");
    if (index === -1) {
      tokenStr = "?token=" + newToken;
    } else {
      tokenStr = "&token=" + newToken;
    }
    let source = new XYZ({
      url: url + tokenStr,
      projection: params.projection || "EPSG:4490",
    });
    let layer = new Tile({
      preload: Infinity,
      zIndex: params.zIndex || 999,
      name,
      title: "测试标题",
      visible: true,
      source,
      serverStyle: params.serverStyle || null,
      serverUrlName: params.serverUrlName || null,
    });
    // source.setTileLoadFunction(wmtsTileLoadFunction);
    //将绘制层添加到地图容器中
    this.map.addLayer(layer);
    return layer;
  }
  // 加载服务
  createCgLayerByUrl(url, params = {}) {
    let source = new XYZ({
      url,
      maxZoom: 18
    });
    let layer = new Tile({
      preload: Infinity,
      zIndex: params.zIndex || 1,
      name: params.name,
      title: "测试标题",
      visible: true,
      source,
      serverStyle: params.serverStyle || null,
      serverUrlName: params.serverUrlName || null,
    });
    // source.setTileLoadFunction(wmtsTileLoadFunction);
    //将绘制层添加到地图容器中
    this.map.addLayer(layer);
    return layer;
  }
  initGeoserver(params = {}) {
    let baseUrl = "/hn-zygl/geoserver/hn_zygl/wms";
    if (
      params.database == "hn_zygl:hn_zyjc_main" ||
      params.database == "hn_zygl:hn_zyjc_main_analyse"
    ) {
      params.val = params.val + "&&is_delete=0";
    }
    let wfs = new TileWMS({
      url: baseUrl,
      params: {
        LAYERS: params.database,
        layerId: Math.random(),
        VERSION: "1.1.0",
        CQL_FILTER: params.val,
      },
      serverType: "geoserver",
      crossOrigin: "anonymous",
      projection: "EPSG:4490",
    });
    // wfs.setTileLoadFunction(wmtsTileLoadFunction);
    console.log('增加缓存1')
    let layer = new Tile({
      preload: Infinity,
      name: params.name,
      zIndex: params.zIndex || 999,
      source: wfs,
    });
    this.map.addLayer(layer);
    return layer;
  }
  laerTobbox(bbox) {
    //根据范围定位
    let str = bbox.slice(4, -1);
    let strNew = str.split(" ");
    let event = strNew.join().split(",");
    this.map.getView().fit(event, {
      padding: [100, 100, 100, 100],
    });
  }
  // 加载geoserver服务
  createLayerByGeoserver(params = {}) {
    let baseUrl = "/hn-zygl/geoserver/hn_zygl/wms";
    if (
      params.database == "hn_zygl:hn_zyjc_main" ||
      params.database == "hn_zygl:hn_zyjc_main_analyse"
    ) {
      params.val = params.val + "&&is_delete=0";
    }
    console.log(params.database, "params.database");
    let wfs = new TileWMS({
      url: baseUrl,
      params: {
        LAYERS: params.database,
        layerId: Math.random(),
        a: "dkdk",
        VERSION: "1.1.0",
        CQL_FILTER: `${params.code}&&${params.val}`,
        catalog_id: params.id,
      },
      serverType: "geoserver",
      crossOrigin: "anonymous",
      projection: "EPSG:4490",
    });
    wfs.CQL_FILTER = `${params.code}&&catalog_id=${params.id}`;
    // wfs.setTileLoadFunction(wmtsTileLoadFunction);
    console.log('增加缓存2')
    let layer = new Tile({
      preload: Infinity,
      name: params.name,
      zIndex: params.zIndex || 999,
      source: wfs,
    });
    this.map.addLayer(layer);
    return layer;
  }
  // 创建一个新图层
  createLayer(source, name, addMap = true, params = {}) {
    if (!source) {
      //实例化一个矢量图层Vector作为绘制层
      source = new VectorSource();
    }
    //创建一个图层
    var layer = new VectorLayer({
      name: name || "自定义图层",
      source,
      zIndex: params.zIndex || 999,
    });
    let style = new Style({
      fill: new Fill({
        color: "rgba(255, 255, 255, 0.5)",
      }),
      stroke: new Stroke({
        color: "#4397f7",
        width: 3,
      }),
      image: new StyleCircle({
        radius: 7,
        fill: new Fill({
          color: "red",
        }),
      }),
    });
    // 设置样式
    layer.setStyle(style);
    if (addMap) {
      //将绘制层添加到地图容器中
      this.map.addLayer(layer);
    }
    return layer;
  }
  // 创建一个样式对象
  createStyle(
    { fillColor, borderColor = "#4397f7", borderWidth = 3, lineDash = [] },
    layer
  ) {
    let params = {
      fill: new Fill({
        color: fillColor, // 填充色
      }),
      stroke: new Stroke({
        color: borderColor, // 边框颜色
        width: borderWidth,
        lineDash,
      }),
      image: new StyleCircle({
        radius: 7,
        fill: new Fill({
          color: "red",
        }),
      }),
    };
    let style = new Style(params);
    if (layer) {
      layer.setStyle(style);
    }
    return style;
  }
  // 根据wkt创建一个矢量图形
  createPolygonByString(wkt, layer, fly = true, aattributes) {
    let format = new WKT();
    let feature = null;
    try {
      feature = format.readFeature(wkt, {
        dataProjection: "EPSG:4490",
        featureProjection: "EPSG:4490",
      });
      feature.attributes = aattributes;
      if (layer) {
        layer.getSource().addFeature(feature);
        if (fly) {
          this.layerTo("feature", feature);
        }
      }
    } catch (error) {
      Message({
        message: "绘制错误!",
        type: "warning",
      });
    }
    return feature;
  }
  getCircleGeoJson(circle) {
    let centerLogLat = circle.getCenter();
    let radius = circle.getRadius();
    radius = Number(radius) * 100;
    var options = {
      steps: 50,
      units: "kilometers",
      properties: { foo: "bar" },
    };
    var res = turf.circle(centerLogLat, radius, options);
    return res;
  }
  // geoJson 转换 wkt layer：测试使用
  getJsonToWkt(geoJson, layer) {
    let geometry;
    if (geoJson.geometry.type === "MultiPolygon") {
      geometry = new MultiPolygon(geoJson.geometry.coordinates);
    } else if (geoJson.geometry.type === "Polygon") {
      geometry = new Polygon(geoJson.geometry.coordinates);
    } else {
      return "";
    }
    let feature = new Feature({
      geometry,
    });
    if (layer) {
      layer.getSource().addFeature(feature);
    }
    return this.featureToWKT(feature);
  }
  // 定位矢量
  layerTo(
    type,
    target,
    params = { duration: 800, padding: [400, 400, 400, 450] }
  ) {
    let extent = {};
    if (type === "feature") {
      extent = target.getGeometry().getExtent();
    } else if (type === "layer") {
      extent = target.getSource().getExtent();
    } else {
      return;
    }
    let ps = {
      duration: params.duration, //动画的持续时间,
      callback: params.callback,
      maxZoom: 18,
      // padding: params.padding,
    };
    if (params.padding) {
      ps.padding = params.padding;
    }
    //定位范围
    this.map.getView().fit(extent, ps);
  }
  // 自动距离 画圆
  drawCircleByStation(obtData) {
    function setCircleStyle(color, color1) {
      return new Style({
        fill: new Fill({
          color: color,
        }),
        stroke: new Stroke({
          color: color1,
          width: 1,
          // lineDash: [10]
        }),
      });
    }
    let layerArr = this.map.getLayers().getArray();
    let circleLayer = layerArr.filter(
      (item) => item.values_.name == "circlelayer"
    );
    if (circleLayer.length) {
      this.map.removeLayer(circleLayer[0]);
    }
    let stationData = obtData;
    let layer = new VectorLayer({
      zIndex: 10,
      visible: false,
      name: "现场举证热力图",
    });
    let source = new VectorSource();
    let positions = [];
    for (let i in stationData) {
      let curData = stationData[i];
      let [lon, lat] = [Number(curData.lon), Number(curData.lat)];
      positions.push([lon, lat]);
    }
    // 首先颜色配置、接着到 虚线 、 接着 到半径 依次生成features  将其放入该图层
    let colorArray = ["#f3111133", "#e2ea8f33", "#11bff34d"];
    function circleCallback(feature, index, color) {
      feature.setStyle(setCircleStyle(color, color.slice(0, -2)));
    }
    let feature5km = this.drawCircle(
      positions,
      5000,
      circleCallback,
      colorArray[2],
      "5km"
    );
    let feature3km = this.drawCircle(
      positions,
      3000,
      circleCallback,
      colorArray[1],
      "3km"
    );
    let feature1km = this.drawCircle(
      positions,
      1000,
      circleCallback,
      colorArray[0],
      "1km"
    );
    let allFeatures = feature5km.concat(feature3km).concat(feature1km);

    source.addFeatures(allFeatures);
    layer.setSource(source);
    // return layer
    this.map.addLayer(layer);
  }
  drawCircle(
    centerPosition,
    radius = 2000,
    callback,
    color = "#000",
    text = ""
  ) {
    let features = [];
    for (let i = 0; i < centerPosition.length; i++) {
      let EPSGTransCoord = fromLonLat(centerPosition[i], "EPSG:3857"); //,'EPSG:3857'
      let circle = new CircleGeom(EPSGTransCoord, radius);

      let feature = new Feature({
        geometry: fromCircle(circle).transform("EPSG:3857", "EPSG:4326"),
      });
      let coord = feature.getGeometry().getLinearRings()[0].getCoordinates()[0];
      let featureText = new Feature({
        geometry: new Point(coord),
      });
      featureText.setStyle(
        new Style({
          text: new Text({
            font: "16px Microsoft YaHei",
            text: text,
            textAlign: "right", //对齐方式
            textBaseline: "middle", //文本基线
            fill: new Fill({
              // color: color
              color: "#000",
            }),
            offsetX: 10,
          }),
        })
      );
      if (callback !== undefined && typeof callback === "function") {
        callback(feature, i, color);
      }
      features.push(feature, featureText);
    }
    return features;
  } // 添加分屏卷帘图标的点
  maps(src, wkt, map) {
    wkt = wkt.slice(6, -1);
    wkt = wkt.split(" ");
    console.log(wkt, "this.row.wkt");
    let vectorLayer, vectorSource;
    const iconFeature = new Feature({
      // geometry: new Point([111.474837,26.542256]),
      geometry: new Point(wkt),
      name: "Null Island",
      population: 4000,
      rainfall: 500,
    });
    const iconStyle = new Style({
      image: new Icon({
        anchor: [0.5, 46],
        anchorXUnits: "fraction",
        anchorYUnits: "pixels",
        src: src,
      }),
    });
    iconFeature.setStyle(iconStyle);
    vectorSource = new VectorSource({
      features: [iconFeature],
    });
    vectorLayer = new VectorLayer({
      source: vectorSource,
    });
    map.addLayer(vectorLayer);
    // map.getView().setCenter([111.474837,26.542256])
    map.getView().setCenter(wkt);
  }
  // 添加绘画交互
  createDraw(layer, type, params = {}) {
    // 获取图层资源
    let source = layer.getSource();
    let geometryFunction, maxPoints;
    if (type === "Box") {
      type = "LineString";
      maxPoints = 2;
      geometryFunction = createBox();
    }
    // 设置为方块样式
    const sketchStyle = new Style({
      image: new RegularShape({
        fill: new Fill({
          color: "rgba(0, 0, 0, 0)", // 空心
        }),
        stroke: new Stroke({
          color: "#4397F7", // 蓝色线
          width: 2,
        }),
        points: 4,
        radius: 9,
        angle: Math.PI / 4,
      }),
      stroke: new Stroke({
        color: "#4397F7",
        width: 4,
      }),
    });
    // 创建中心点样式
    const centerPointStyle = new Style({
      image: new StyleCircle({
        radius: 3,
        fill: new Fill({ color: "#4397F7" }),
      }),
    });
    // 清除上次的绘制
    this.removeDraw();
    this.draw = new Draw({
      source,
      type,
      geometryFunction,
      maxPoints,
      style: params.style || [sketchStyle, centerPointStyle],
    });
    // 绘制过程中会执行
    let change = (e) => {
      if (params && params.change) {
        params.change(e);
      }
      // 点追踪 当前绘制的点在图形边缘时加载要素信息在弹框中
      let geometry = this.drawingFeature.getGeometry();
      // 获取当前绘制的图形的坐标
      var coordinates = geometry.getCoordinates();
      // 最后一个点坐标
      let coord = [];
      // 获取绘制过程中的最后一个点的坐标
      if (geometry.getType() === "LineString") {
        // 如果当前是线段类型（线分割）
        coord = coordinates[coordinates.length - 1];
      } else if (geometry.getType() === "Polygon") {
        // 如果当前是多边形类型（擦除、补绘）
        let arr = coordinates[0];
        coord = arr[arr.length - 2];
      } else {
        return;
      }
      let features = [];
      let editLayer = this.getLayersByName("图斑编辑图层");
      let layers = [this.pointLineLayer, ...editLayer];
      layers.forEach((layer) => {
        if (!layer) return;
        // 过滤，将MultiPolygon拆分成Polygon
        layer.getSource().forEachFeature((res) => {
          let feas = this.mPolygonScatter(res);
          features.push(...feas);
        });
      });
      // 判断最后一个坐标点是否在图形边线上-如果在线上就显示弹框
      let curretntfeature = this.isPintOnLine(features, coord);
      if (curretntfeature) {
        let coods = curretntfeature.getGeometry().getCoordinates()[0];
        // 是否是折点
        let isZd = false;
        coods.forEach((item) => {
          if (item[0] === coord[0] && item[1] === coord[1]) {
            isZd = true;
          }
        });
        let name = curretntfeature.params?.name;
        let content = isZd ? "（折点）" : "（边线）";
        if (name) {
          content = name + content;
        }
        // coord点位，content弹框内容
        this.addPopup(coord, content);
      } else {
        this.addPopup(undefined);
      }
    };
    // 绘制开始时执行（第一个点 点下去时）
    this.draw.on("drawstart", (evt) => {
      this.addHistory();
      if (params && params.start) {
        params.start(evt);
      }
      this.drawingFeature = evt.feature;
      // 绘制的时候 绘制辅助线变化时执行
      this.drawingFeature.on("change", change);
    });
    this.draw.on("drawend", (evt) => {
      if (params && params.end) {
        params.end(evt);
      }
      // 清除变化时间
      this.drawingFeature.un("change", change);
      this.drawingFeature = null;
      this.addPopup(undefined);
    });
    this.map.addInteraction(this.draw);
    this.addSnap(this.pointLineLayer);
    return this.draw;
  }
  // 点回退
  removeLastPoint(layer, type) {
    this.draw.removeLastPoint();
  }
  // 移除绘画交互
  removeDraw() {
    this.map.removeInteraction(this.draw);
    this.draw = null;
  }
  // 临时绘制 用于切割和挖孔时使用
  startTempDarw(type = "LineString", endCallback) {
    if (!this.tempDarwLayer) {
      this.tempDarwLayer = this.createLayer(null, "临时绘制图层");
    }
    let draw = this.createDraw(this.tempDarwLayer, type);
    draw.on("drawend", (evt) => {
      endCallback(evt);
      this.tempDarwLayer.getSource().clear();
      this.tempDarwLayer.setVisible(false);
    });
  }
  // 分割
  createTailor(layer, callback) {
    this.startTempDarw("LineString", (evt) => {
      var feature = evt.feature;
      var coords = feature.getGeometry().getCoordinates();
      let fgRes = false;
      let fgOk = false;
      let tempNum = 0;
      layer.getSource().forEachFeature((item) => {
        let coordinates = [];
        if (item.getGeometry().getType() === "MultiPolygon") {
          coordinates = item.getGeometry().getCoordinates();
        } else if (item.getGeometry().getType() === "Polygon") {
          coordinates = [item.getGeometry().getCoordinates()];
        } else {
          if (callback) {
            callback(evt, fgRes);
          }
          return;
        }
        try {
          let first = JSON.stringify(coordinates[0][0][0]);
          let last = JSON.stringify(
            coordinates[0][0][coordinates[0][0].length - 1]
          );
          if (first !== last) {
            coordinates[0][0].push(coordinates[0][0][0]);
          }
        } catch (error) {
          console.log(error);
        }
        let poly = {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates,
          },
        };
        var line = turf.lineString(coords);
        let lineIntersect = turf.lineIntersect(line, poly);
        if (lineIntersect.features.length >= 2) {
          let res = this.getFG(coords, layer, poly, item.params);
          if(res === ''){
            Message({
              message:"图斑过小不可分割!",
              type: "warning",
            });
            fgRes = false;
            fgOk = true;
          }  else if (res) {
            layer.getSource().removeFeature(item);
            fgOk = true;
            fgRes = true;
          } else {
            Message({
              message: "起点和终点必须在多边形之外!",
              type: "warning",
            });
            fgRes = false;
            fgOk = true;
          }
        } else {
          if (tempNum < lineIntersect.length) {
            tempNum = lineIntersect.length;
          }
        }
      });
      if (!fgOk) {
        if (tempNum === 0) {
          Message({
            message: "没有相交点！",
            type: "warning",
          });
          fgRes = false;
        }
      }
      if (callback) {
        callback(evt, fgRes);
      }
    });
  }
  // 执行分割
  getFG(coords, layer, poly, params) {
    var line = turf.lineString(coords);
    const { features: polygons } = actionFg(poly, line);
    if (polygons.length > 0) {
      let merRes = polygons
      try {
        merRes = this.littleMerge(merRes); 
        if(merRes.length === 0){
          return ''
        }
      } catch (error) {
        console.log(error)
      }
      this.addHistory();
      merRes.forEach((polygon) => {
        let newFeature = this.addGeoJSON(polygon, layer)[0];
        newFeature.params = params;
      });
      return true;
    } else {
      return false;
    }

    // 过滤重复点
    function filterDuplicatePoints(coordinates) {
      const filteredCoordinates = [];
      const visitedCoordinates = {};

      for (let i = 0; i < coordinates.length; i++) {
        const coordStr = coordinates[i].toString();
        if (!visitedCoordinates[coordStr]) {
          visitedCoordinates[coordStr] = true;
          filteredCoordinates.push(coordinates[i]);
        }
      }
      return filteredCoordinates;
    }
    // 分割计算
    function actionFg(
      poly,
      line,
      tolerance = 0.00000000001,
      toleranceType = "kilometers"
    ) {
      // 1.条件判断
      if (
        turf.booleanPointInPolygon(
          turf.point(line.geometry.coordinates[0]),
          poly
        ) ||
        turf.booleanPointInPolygon(
          turf.point(
            line.geometry.coordinates[line.geometry.coordinates.length - 1]
          ),
          poly
        )
      ) {
        console.log("起点和终点必须在多边形之外");
        return [];
      }
      // 2. 计算交点，并把线的点合并
      let lineIntersect = turf.lineIntersect(line, poly);
      const lineExp = turf.explode(line);
      for (let i = 0; i < lineExp.features.length - 1; i++) {
        lineIntersect.features.push(
          turf.point(lineExp.features[i].geometry.coordinates)
        );
      }
      // 3. 计算线的缓冲区
      const lineBuffer = turf.buffer(line, tolerance, {
        units: toleranceType,
      });
      // 4. 计算线缓冲和多边形的difference，返回"MultiPolygon"，所以将其拆开
      let _body = turf.difference(poly, lineBuffer);
      _body = turf.truncate(_body, { precision: 10, coordinates: 2 });
      let pieces = [];
      if (_body.geometry.type === "Polygon") {
        pieces.push(turf.polygon(_body.geometry.coordinates));
      } else {
        _body.geometry.coordinates.forEach(function (a) {
          pieces.push(turf.polygon(a));
        });
      }
      // 5. 处理点数据
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        for (let c in piece.geometry.coordinates[0]) {
          const coord = piece.geometry.coordinates[0][c];
          const p = turf.point(coord);
          for (let lp in lineIntersect.features) {
            const lpoint = lineIntersect.features[lp];
            if (turf.distance(lpoint, p, toleranceType) <= tolerance * 2) {
              piece.geometry.coordinates[0][c] = lpoint.geometry.coordinates;
            }
          }
        }
      }
      // 6. 过滤掉重复点
      for (let i = 0; i < pieces.length; i++) {
        const coords = pieces[i].geometry.coordinates[0];
        // filterDuplicatePoints(coords);
        pieces[i].geometry.coordinates[0] = filterDuplicatePoints(coords);
      }
      // 7. 将属性赋予每一个polygon，并处理id
      pieces.forEach((a, index) => {
        a.properties = Object.assign({}, poly.properties);
        a.properties.id += `-${index}`;
      });
      return turf.featureCollection(pieces);
    }
  }
  // 合并
  mearge(layer, selfFeatures) {
    let features = selfFeatures || this.select.getFeatures().getArray();
    let coordinates = [];
    features.forEach((fea) => {
      let feature = fea.getGeometry();
      if (feature.getType() === "MultiPolygon") {
        coordinates.push(...feature.getCoordinates());
      } else if (feature.getType() === "Polygon") {
        coordinates.push(feature.getCoordinates());
      }
    });
    if (coordinates.length <= 1) {
      return;
    }
    coordinates.forEach((coords) => {
      let first = JSON.stringify(coords[0][0]);
      let last = JSON.stringify(coords[0][coords[0].length - 1]);
      if (first !== last) {
        coords[0].push(coords[0][0]);
      }
    });
    let union = turf.polygon(coordinates[0]);
    for (let i = 1; i < coordinates.length; i++) {
      var poly = turf.polygon(coordinates[i]);
      union = turf.union(union, poly);
    }
    const geoFeatures = new GeoJSON().readFeatures(union);
    geoFeatures[0].params = features[0].params;
    if (layer) {
      this.addHistory();
      setTimeout(() => {
        layer.getSource().addFeatures(geoFeatures);
      }, 0);
      this.deleteFeature(layer);
    }
    return geoFeatures;
  }
  // 补绘
  mergeRes(layer) {
    let tempFeature = null;
    this.createDraw(layer, "Polygon", {
      end: (e) => {
        let { feature } = e;
        tempFeature = feature;
        setTimeout(() => {
          action();
        }, 0);
      },
    });
    let that = this;
    const action = () => {
      let features = layer.getSource().getFeatures();
      if (features.length <= 1) {
        return;
      }
      let drawFeature = features[features.length - 1];
      let tempFeatures = [drawFeature];
      for (let i = 0; i < features.length - 1; i++) {
        const feature = features[i];
        // 验证绘制的补绘矢量是否与之相交
        if (this.isContains(drawFeature, feature, 2)) {
          tempFeatures.push(feature);
        }
      }
      let coordinates = [];
      // 将多多边形拆成普通多边形
      tempFeatures.forEach((fea) => {
        let feature = fea.getGeometry();
        if (feature.getType() === "MultiPolygon") {
          coordinates.push(feature.getCoordinates()[0]);
        } else if (feature.getType() === "Polygon") {
          coordinates.push(feature.getCoordinates());
        }
      });
      // 存储最后的切分结果
      let union = turf.polygon(coordinates[0]);
      let unionRes = [];
      for (let i = 1; i < coordinates.length; i++) {
        var poly = turf.polygon(coordinates[i]);
        union = turf.union(union, poly);
        if (union.geometry.type === "Polygon") {
          unionRes.push(union);
        }
      }
      if (unionRes.length === 0) {
        Message({
          type: "warning",
          message: "补绘与原图斑无相交",
        });
        return;
      }
      // 只取最后的补绘结果
      unionRes = [unionRes[unionRes.length - 1]];
      layer.getSource().removeFeature(tempFeature);
      let resFeatures = [];
      unionRes.forEach((item) => {
        const geoFeatures = new GeoJSON().readFeatures(item);
        geoFeatures[0].params =
          features[0]?.params && JSON.parse(JSON.stringify(features[0]?.params));
        resFeatures.push(...geoFeatures);
      });
      that.addHistory();
      setTimeout(() => {
        layer.getSource().addFeatures(resFeatures);
      }, 0);
      tempFeatures.forEach((feature, i) => {
        if (i === 0) return;
        try {
          layer.getSource().removeFeature(feature);
        } catch (error) {
          console.log(error);
        }
      });
    };
  }
  // 擦除
  clearPolygon(feas, isHis = true) {
    let features = feas || this.select.getFeatures().getArray();
    let coordinates = [];
    let sliceIndex = 1;
    features.forEach((fea, index) => {
      let feature = fea.getGeometry();
      if (feature.getType() === "MultiPolygon") {
        let coords = feature.getCoordinates();
        if (index === 0) {
          sliceIndex = coords.length;
        }
        coordinates.push(...coords);
      } else if (feature.getType() === "Polygon") {
        coordinates.push(feature.getCoordinates());
      }
    });
    if (coordinates.length <= 1) {
      return;
    }
    let resCoordinates = coordinates.slice(0, sliceIndex);
    let masks = coordinates.slice(sliceIndex);
    if (isHis) {
      this.addHistory();
    }
    let resultArr = [];
    const action = (startCoords, masks) => {
      let isFor = true;
      let polygon;
      try {
        polygon = turf.polygon(startCoords);
      } catch {
        console.log("过小图斑", startCoords);
      }
      let result;
      masks.forEach((coord, i) => {
        if (!isFor || !polygon) return;
        let mask = {};
        try {
          mask = turf.polygon(coord);
          result = turf.difference(polygon, mask);
        } catch (error) {
          console.log(error);
          result = polygon;
        }
        if (!result) {
          isFor = false;
          return;
        }
        if (result.geometry.type === "Polygon") {
          if (i === masks.length - 1) {
            resultArr.push(result);
          } else {
            polygon = turf.polygon(result.geometry.coordinates);
          }
        } else if (result.geometry.type === "MultiPolygon") {
          let coords = result.geometry.coordinates;
          coords.forEach((coord) => {
            action(coord, masks);
          });
          isFor = false;
        }
      });
    };
    resCoordinates.forEach((coord) => {
      action(coord, masks);
    });
    // this.deleteFeature(layer);
    let resultFeature = [];
    resultArr.forEach((geoJson) => {
      let features = this.addGeoJSON(geoJson);
      resultFeature.push(features[0]);
    });
    return resultFeature;
  }
  // 绘制擦除
  darwClearPolygon(layer, show) {
    let tempFeature = null;
    this.createDraw(layer, "Polygon", {
      end: (e) => {
        let { feature } = e;
        tempFeature = feature;
        let features = layer.getSource().getFeatures();
        let result = [];
        this.addHistory();
        features.forEach((fea) => {
          let newFeatures = this.clearPolygon([fea, tempFeature], false);
          if (fea.params) {
            newFeatures.forEach((f) => {
              f.params = fea.params;
            });
          }
          if (newFeatures.length > 1 && show) {
            //是否可以从中分割擦除
            Message({
              type: "warning",
              message: "请勿从中间擦除",
            });
            try {
              layer.getSource().addFeatures([fea]);
            } catch (error) {
              error;
            }
            return;
          }
          result.push(...newFeatures);
        });
        setTimeout(() => {
          layer.getSource().clear();
          layer.getSource().addFeatures(result);
        }, 0);
      },
    });
  }
  // 选择擦除
  selectClearPolygon(layer) {
    let features = this.select.getFeatures().getArray();
    if (features && features.length > 2) {
      Message({
        type: "warning",
        message: "必须选择两个以上的元素",
      });
      return;
    }
    this.addHistory();
    let clearAll = this.clearPolygon(features);
    let inAll = this.qfByPolygon(features);
    let result = [...clearAll, ...inAll];
    if (result) {
      layer.getSource().removeFeature(features[0]);
      result.forEach((feature) => {
        if (features[0].params) {
          feature.params = features[0].params;
        }
        layer.getSource().addFeature(feature);
      });
    }
    return;
  }
  // 获取多边形与多边形相交部分
  qfByPolygon(feas) {
    let features = feas || this.select.getFeatures().getArray();
    let coordinates = [];
    let sliceIndex = 1;
    features.forEach((fea, index) => {
      let feature = fea.getGeometry();
      if (feature.getType() === "MultiPolygon") {
        let coords = feature.getCoordinates();
        if (index === 0) {
          sliceIndex = coords.length;
        }
        coordinates.push(...coords);
      } else if (feature.getType() === "Polygon") {
        coordinates.push(feature.getCoordinates());
      }
    });
    if (coordinates.length <= 1) {
      return;
    }
    let resCoordinates = coordinates.slice(0, sliceIndex);
    let masks = coordinates.slice(sliceIndex);
    let resultFeature = [];
    const action = (startCoords, masks) => {
      let resultArr = [];
      let polygon = turf.polygon(startCoords);
      masks.forEach((coord) => {
        let mask = turf.polygon(coord);
        let resFeature = turf.intersect(polygon, mask);
        if (resFeature) {
          // 目标图斑被取并集之后剩余的部分继续给剩下的图斑拿来取并集
          let surplus =  turf.difference(polygon, resFeature);
          polygon = surplus;
          resultArr.push(resFeature);
        }
      });

      resultArr.forEach((geoJson) => {
        let features = this.addGeoJSON(geoJson);
        resultFeature.push(features[0]);
      });
    };
    resCoordinates.forEach((coord) => {
      action(coord, masks);
    });
    return resultFeature;
  }
  // 分解 将 MultiPolygon 转换成 多个Polygon
  mPolygonScatter(feature, layer) {
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
      if (multiPolygon.params) {
        newFeature.params = multiPolygon.params;
      }
      newFeatures.push(newFeature);
    }
    if (layer) {
      this.addHistory();
      layer.getSource().removeFeature(multiPolygon);
      layer.getSource().addFeatures(newFeatures);
    } else {
      return newFeatures;
    }
  }
  // 挖孔
  createWk(layer) {
    this.startTempDarw("Polygon", (evt) => {
      let isSaveDraw = false;
      var feature = evt.feature;
      var coords = feature.getGeometry().getCoordinates();
      layer.getSource().forEachFeature((item) => {
        let coordinates = [];
        if (item.getGeometry().getType() === "MultiPolygon") {
          coordinates = item.getGeometry().getCoordinates()[0];
        } else if (item.getGeometry().getType() === "Polygon") {
          coordinates = item.getGeometry().getCoordinates();
        } else {
          return;
        }
        var polygon;
        if (coordinates.length > 1) {
          polygon = turf.polygon([coordinates[0]]);
        } else {
          polygon = turf.polygon(coordinates);
        }
        var mask = turf.polygon(coords);
        // 判断是否包含
        let res = turf.booleanContains(polygon, mask);
        if (res) {
          const geoJson = {
            type: "Feature",
            // id: Math.floor(Math.random() * 10000),
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [...coordinates, ...coords],
            },
          };
          this.addHistory();
          const geoFeatures = this.addGeoJSON(geoJson, layer);
          geoFeatures[0].params = item.params;
          layer.getSource().removeFeature(item);
          if (!isSaveDraw) {
            let newFeature = evt.feature.clone();
            layer.getSource().addFeature(newFeature);
            isSaveDraw = true;
          }
        }
      });
    });
  }
  // 添加一个圆
  addCircle(layer, { lnt, lat }, text) {
    let point = new Feature({ geometry: new Point([lnt, lat]) });
    layer.getSource().addFeature(point);
    point.setStyle(
      new Style({
        image: new StyleCircle({
          radius: 30,
          stroke: new Stroke({
            width: 3,
            color: "rgba(50, 117, 255, 1)",
          }),
          fill: new Fill({
            color: "rgba(50, 117, 255, .6)",
          }),
        }),
        text: new Text({
          font: "bold 18px Microsoft YaHei",
          text: text,
          fill: new Fill({
            color: "#fff",
          }),
        }),
      })
    );
  }
  // 添加文字
  addText({ lnt, lat }, layer, text, id) {
    var textF = new Feature({
      geometry: new Point([lnt, lat]),
      id, //用户鉴别feature
    });
    // 设置文字style
    textF.setStyle(
      new Style({
        text: new Text({
          font: "bold 16px Microsoft YaHei",
          text,
          fill: new Fill({
            color: "#47a242",
          }),
          stroke: new Stroke({
            color: "white", // 设置文字边框线颜色
            width: 2, // 设置文字边框线宽度
          }),
          offsetY: -15, // 可选，设置文本的垂直偏移量（负值表示在点上方）
          padding: [2, 2, 2, 2],
        }),
      })
    );
    var pointF = new Feature({
      geometry: new Point([lnt, lat]),
      id, //用户鉴别feature
    });
    pointF.setStyle(
      new Style({
        image: new StyleCircle({
          radius: 5, // 设置点的半径
          fill: new Fill({ color: "#47a242" }), // 设置点的填充颜色
          stroke: new Stroke({ color: "white", width: 2 }),
        }),
      })
    );
    if (layer) {
      layer.getSource().addFeatures([textF, pointF]);
    }
  }
  // 添加GeoJOSN
  addGeoJSON(geoJson, layer) {
    const geoFeatures = new GeoJSON().readFeatures(geoJson);
    if (layer) {
      layer.getSource().addFeatures(geoFeatures);
    }
    return geoFeatures;
  }
  // 复制图斑
  copy(layer) {
    let features = this.select.getFeatures().getArray();
    if (!features || !layer) {
      return;
    }
    this.addHistory();
    let newFeatures = [];
    features.forEach((feature) => {
      if (!feature) return;
      let newFeature = feature.clone();
      newFeature.setStyle(null);
      newFeature.params = feature.params;
      newFeatures.push(newFeature);
    });
    layer.getSource().addFeatures(newFeatures);
    return newFeatures;
  }
  // 删除选中的元素
  deleteFeature(layer) {
    let features = this.select.getFeatures().getArray();
    if (!features || !layer) {
      return;
    }
    this.addHistory();
    features.forEach((feature) => {
      layer.getSource().removeFeature(feature);
    });
    if (this.select) {
      //清除所有选中状态
      this.select.getFeatures().clear();
    }
  }
  // 获取feature面积
  getFeatureArea(feature) {
    if (!feature) {
      return 0;
    }
    let geometry = feature.getGeometry();
    let coordinates = [];
    if (geometry.getType() === "Polygon") {
      let coordinatesNew = geometry.getCoordinates();
      let startArr = coordinatesNew[0][0];
      let startPoint = JSON.stringify(startArr);
      let endPoint = JSON.stringify(
        coordinatesNew[0][coordinatesNew[0].length - 1]
      );
      if (startPoint !== endPoint) {
        // 首尾不闭合问题
        coordinatesNew[0].push(startArr);
        feature = new Feature({
          geometry: new Polygon(coordinatesNew),
        });
      }
      coordinates = coordinatesNew;
    } else if (geometry.getType() === "MultiPolygon") {
      coordinates =
        geometry.getCoordinates().length > 0
          ? geometry.getCoordinates()[0]
          : [];
    } else {
      return 0;
    }
    var polygon = turf.polygon(coordinates);
    var area = turf.area(polygon);
    return area;
  }
  // 添加交互事件
  addInteraction(type, layer, callback, style) {
    let tempInter = null;
    if (type === "select") {
      this.removeSelect();
      let params = {};
      if (layer) {
        params.layers = [layer];
      }
      if (style) {
        params.style = style;
      } else {
        params.style = this.selectStyle;
      }
      //初始化一个交互选择控件,并添加到地图容器中
      this.select = new Select(params);
      if (callback) {
        this.select.on("select", callback);
      }
      tempInter = this.select;
    }
    if (type === "selects") {
      this.removeSelect();
      let params = {
        condition: click,
        toggleCondition: click,
      };
      if (layer) {
        params.layers = [layer];
      }
      if (style) {
        params.style = style;
      } else {
        params.style = this.selectStyle;
      }
      //初始化一个交互选择控件,并添加到地图容器中
      this.select = new Select(params);
      if (callback) {
        this.select.on("select", callback);
      }
      tempInter = this.select;
    } else if (type === "modify") {
      if (!this.select || this.modify) {
        return;
      }
      //初始化一个交互编辑控件，并添加到地图容器中
      this.modify = new Modify({
        //选中的要素
        features: this.select.getFeatures(),
      });
      this.modify.on("modifystart", () => {
        this.addHistory();
      });
      this.modify.on("modifyend", () => {
        if (callback) {
          this.select.on("select", callback);
        }
      });
      tempInter = this.modify;
    } else if (type === "move") {
      if (!this.select || this.move) {
        return;
      }
      this.move = new Translate({
        //选中的要素
        features: this.select.getFeatures(),
      });
      if (layer) {
        this.move.set("source", layer.getSource());
      }
      this.move.on("translatestart", () => {
        this.addHistory();
      });
      this.move.on("translateend", () => {
        if (callback) {
          this.select.on("select", callback);
        }
      });
      tempInter = this.move;
    }
    if (tempInter) {
      this.map.addInteraction(tempInter);
    }
  }
  // 增加吸附交互
  addSnap(layer = this.pointLineLayer) {
    // 创建集合（存储需要吸附效果的要素）
    var snapSources = new Collection();
    let editLayer = this.getLayersByName("图斑编辑图层");
    let layers = [layer, ...editLayer, this.editLayer];
    // 获取所有需要吸附效果的图层，获取图层上的要素
    layers.forEach((layer) => {
      if (layer) {
        let features = layer.getSource().getFeatures();
        if (features.length > 0) {
          features.forEach((fea) => {
            // 将当前图层的要素加入到集合中
            snapSources.push(fea);
          });
        }
      }
    });
    if (this.snap) {
      this.map.removeInteraction(this.snap);
    }
    this.snap = new Snap({
      features: snapSources,
    });
    this.map.addInteraction(this.snap);
  }
  // 移除选择
  removeSelect() {
    if (this.select) {
      this.map.removeInteraction(this.select);
    }
  }
  // 移除节点编辑
  removeModify() {
    if (this.modify) {
      this.map.removeInteraction(this.modify);
      this.modify = null;
    }
  }
  // 移除移动效果
  removeMove() {
    if (this.move) {
      this.map.removeInteraction(this.move);
      this.move = null;
    }
  }
  startEdit(layer) {
    this.endEdit();
    this.currentLayer = layer;
  }
  endEdit() {
    this.currentLayer = null;
    this.history = [];
  }
  // 记录操作
  addHistory() {
    if (!this.currentLayer) {
      return;
    }
    let features = this.currentLayer.getSource().getFeatures();
    features = features.map((f) => {
      let cloneFea = f.clone();
      if (f.params) {
        cloneFea.params = f.params;
      }
      if (cloneFea.getStyle()) {
        cloneFea.setStyle(null);
      }
      return cloneFea;
    });
    this.history.push(features);
  }
  // 回退/重做
  rollback(type = "back") {
    if (!this.currentLayer) {
      return;
    }
    let oldFeatures;
    if (type === "back") {
      if (this.history.length == 0) {
        Message({
          message: "不能再后退了！",
          type: "warning",
        });
        return;
      }
      oldFeatures = this.history.pop();
      let features = this.currentLayer.getSource().getFeatures();
      features = features.map((f) => {
        let cloneFea = f.clone();
        if (f.params) {
          cloneFea.params = f.params;
        }
        if (cloneFea.getStyle()) {
          cloneFea.setStyle(null);
        }
        return cloneFea;
      });
      this.backHistory.push(features);
    } else {
      if (this.backHistory.length == 0) {
        Message({
          message: "不能再重做了！",
          type: "warning",
        });
        return;
      }
      oldFeatures = this.backHistory.pop();
      this.addHistory();
    }
    this.currentLayer.getSource().clear();
    this.currentLayer.getSource().addFeatures(oldFeatures);
  }
  // 创建一个多边形（仅供测试使用）
  createDBX(polygons, layer) {
    var features = [];
    polygons.forEach((polygon) => {
      //创建一个多变形
      var iPolygon = new Feature({
        geometry: new Polygon([...polygon.geometry.coordinates]),
      });
      //设置区样式信息
      iPolygon.setStyle(
        new Style({
          //填充色
          fill: new Fill({
            color: [255, 255, 255, 0.3],
          }),
          //边线颜色
          stroke: new Stroke({
            color: "#ffcc33",
            width: 2,
          }),
          //形状
          image: new StyleCircle({
            radius: 7,
            fill: new Fill({
              color: "#ffcc33",
            }),
          }),
        })
      );
      features.push(iPolygon);
    });
    if (layer) {
      features.forEach((feature) => {
        layer.getSource().addFeature(feature);
      });
    } else {
      //实例化一个矢量图层Vector作为绘制层
      var source = new VectorSource({
        features,
      });
      //用于分割的临时图层
      this.fgTempVector = new VectorLayer({
        source: source,
      });
      //将绘制层添加到地图容器中
      this.map.addLayer(this.fgTempVector);
    }
  }
  addIcon(layer, point, { url, scale = 1 }) {
    let style = new Style({
      image: new Icon({
        scale,
        src: url,
      }),
    });
    let feature = gisMap.featureUtils.transformFeatureFromWkt(point);
    feature.setStyle(style);
    layer.getSource().addFeature(feature);
    return feature;
  }
  // 创建一个点或线（仅供测试使用）
  createY(ps, type = "point") {
    let features = [];
    ps.forEach((cn) => {
      if (type == "line") {
        //创建一条线
        var cretePoint = new Feature({
          geometry: new LineString(cn),
        });
      } else {
        //创建一个点
        var cretePoint = new Feature({
          geometry: new Point(cn),
        });
      }
      cretePoint.setStyle(
        new Style({
          //填充色
          fill: new Fill({
            color: "rgba(255, 255, 255, 0.5)",
          }),
          //边线颜色
          stroke: new Stroke({
            color: "#ffcc33",
            width: 4,
          }),
          //形状
          image: new StyleCircle({
            radius: 7,
            fill: new Fill({
              color: "red",
            }),
          }),
        })
      );
      features.push(cretePoint);
    });
    //实例化一个矢量图层Vector作为绘制层
    var source = new VectorSource({
      features,
    });
    //创建一个图层
    var vector = new VectorLayer({
      source: source,
      zIndex: 99999,
    });
    //将绘制层添加到地图容器中
    this.map.addLayer(vector);
  }
  // 测试图斑
  testTb(layer) {
    const tbData = [
      {
        geometry: {
          coordinates: datas[0].features[0].geometry.coordinates[0],
          type: "Polygon",
        },
        properties: {},
        type: "Feature",
      },
    ];
    this.createDBX(tbData, layer);
  }
  initXzbj(geome, id) {
    //高亮图斑
    // console.log(geome,id,'geome,id');
    let feature = {
      attributes: {
        name: "citygl",
        allCommon: `cityglXzbj`,
        id,
      },
      style: {
        fillcolor: "rgba(0, 0, 0, 0)",
        // strokecolor: "red",
        strokecolor: "orange",
        strokewidth: 3,
      },
      geometry: geome,
    };
    gisMap.addPolygon(feature);
  }
  initXzbjRemove(name) {
    //删除勾选的图斑
    let features = gisMap.featuresSource.getFeatures();
    let someOne = features.filter((item) => item.attributes.allCommon == name);
    if (someOne.length) {
      someOne.filter((item) => {
        gisMap.featuresSource.removeFeature(item);
      });
    }
  }
  // 定位图斑
  locationGeome(geome, id) {
    this.clearCityService();
    let feature = {
      attributes: {
        name: "cityName",
        allCommon: "cityNameXzbj",
        id,
      },
      style: {
        fillcolor: "rgba(255, 255, 255, 0)",
        strokecolor: "red",
        strokewidth: 2,
      },
      geometry: geome,
    };
    let f = gisMap.featureUtils.transformFeatureFromWkt(geome);
    // 飞到某地
    gisMap.flyTo(f, () => {});
    gisMap.addPolygon(feature);
  }
  clearCityService() {
    // 先查看是否有图层服务，有则删除再添加
    let layerFeature = gisMap.featuresSource.getFeatures();
    if (layerFeature.length !== 0) {
      gisMap.featuresSourceVectorLayer.getSource().clear();
    }
  }
}
export default JMap;
