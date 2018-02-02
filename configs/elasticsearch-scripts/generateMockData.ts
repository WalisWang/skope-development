import * as path from 'path';
import * as fs from 'fs-extra';
import * as glob from 'glob';
import * as uuidv4 from 'uuid/v4';
import * as faker from 'faker';
import * as moment from 'moment';
import * as LocalTypes from './types';
import getConnection from './getConnection';
const client = getConnection();

const sourceDataDirectoryPath : string = path.resolve(__dirname, '../elasticsearch-source-data');

const convertEsDateFormat2MomentFormat = (
  esDateFormat : string,
) : string => {
  esDateFormat = esDateFormat.replace('yyyy', 'YYYY');
  esDateFormat = esDateFormat.replace('dd', 'DD');

  return esDateFormat;
};

const getPropertyType = (
  propDef : LocalTypes.PropertyDefinition,
) : string => {
  if ('type' in propDef) {
    return propDef.type;
  }

  if ('properties' in propDef) {
    return 'object';
  }

  return 'keyword';
};

const getMockDataForType = (
  propDef : LocalTypes.PropertyDefinition,
  propName : string,
  fullPropPath : string,
) : any => {
  const propType : string = getPropertyType(propDef);

  switch (propType) {
    case 'keyword':
      return faker.lorem.word();
    case 'text':
      return faker.lorem.words();
    case 'byte':
      return faker.random.number(127);
    case 'short':
      return faker.random.number(32767);
    case 'integer': // Fall-through
    case 'long': // Fall-through
    case 'double': // Fall-through
    case 'float': // Fall-through
      return faker.random.number();
    case 'boolean':
      return faker.random.boolean();
    case 'date':
      const date : Date = faker.date.past();

      if ('format' in propDef) {
        const convertedDateFormat : string = convertEsDateFormat2MomentFormat(propDef.format);
        return moment(date).format(convertedDateFormat);
      }

      return date;
    case 'nested':
      const patchedPropDef : Object = {
        ...propDef,
        type: 'object',
      };

      return [
        getMockDataForProperty(propName, fullPropPath, patchedPropDef),
        getMockDataForProperty(propName, fullPropPath, patchedPropDef),
        getMockDataForProperty(propName, fullPropPath, patchedPropDef),
        getMockDataForProperty(propName, fullPropPath, patchedPropDef),
      ];
    case 'object':
      const subPropNames : Array<string> = Object.keys(propDef.properties);
      const newDoc : Object = subPropNames.reduce((acc, subPropName) => {
        const subPropDef : Object = propDef.properties[subPropName];
        const subPropValue : any = getMockDataForProperty(
          subPropName,
          `${propName}.${subPropName}`,
          subPropDef,
        );
    
        return {
          ...acc,
          [subPropName]: subPropValue,
        };
      }, {});

      return newDoc;
    case 'geo_shape':
      // Only generate polygons for now.
      // Generated path can not cross itself.

      const vertexCount = 3 + faker.random.number(3);
      const precision = 100000;

      /**
       * @param {o=Object} options
       * @param {Array.<number>} options.origin
       * @param {number} options.direction - Radian between 0 and 2Pi.
       * @param {number} options.distance
       */
      const generatePointNear = ({
        origin,
        direction,
        distance,
      }) => origin.map((x, index) => {
        if (index > 1) {
          return x;
        }

        const offset = faker.random.number(precision) / precision * distance;

        const newX = index === 0
          ? x + Math.cos(direction) * offset
          : x + Math.sin(direction) * offset;

        return parseFloat(newX.toFixed(precision.toFixed(0).length + 1));
      });

      /**
       * @param {[number, number]} point
       */
      const boundPoint = (point) => ([
        point[0] % 180,
        point[1] % 80,
      ]);

      const geometry = {
        type: "polygon",
        coordinates: [
          [],
        ]
      };

      const centerPoint = generatePointNear({
        origin: [0, 0],
        direction: faker.random.number(precision) / precision * 2 * Math.PI,
        distance: 90,
      });
      // Correct the magnitude of the first axis.
      centerPoint[0] = centerPoint[0] * 2;

      const coordGroup = geometry.coordinates[0];

      for (let i = 0; i < vertexCount; i += 1) {
        let newPoint = generatePointNear({
          origin: centerPoint,
          direction: 2 * Math.PI / vertexCount * i,
          distance: 5,
        });

        newPoint = boundPoint(newPoint);

        coordGroup.push(newPoint);
      }

      // End point must be the start point.
      coordGroup.push(coordGroup[0]);

      return geometry;
    default:
      console.warn(`Unknown type: ${propType}.`);
      return null;
  }
};

const getMockDataForProperty = (
  propName : string,
  fullPropPath : string,
  propDef : any,
) : any => {
  switch (true) {
    case fullPropPath === 'skopeid':
      return faker.random.uuid();
    case fullPropPath === 'type':
      return 'dataset';
    case fullPropPath === 'descriptionMD':
      return faker.lorem.paragraphs();
    case fullPropPath === 'investigators':
      return [
        faker.name.findName(),
        faker.name.findName(),
        faker.name.findName(),
        faker.name.findName(),
      ];
    case fullPropPath === 'status':
      return faker.lorem.word();
    case fullPropPath === 'publisher.name':
      return faker.name.findName();
    case fullPropPath === 'publisher.nickname':
      return faker.name.findName();
    case fullPropPath === 'dataTypes':
      return [
        faker.lorem.word(),
        faker.lorem.word(),
        faker.lorem.word(),
        faker.lorem.word(),
      ];
    case fullPropPath === 'timespan':
      const endDate : Date = faker.date.past();
      const startDate : Date = faker.date.past(3, endDate);

      // Format should be "strict_year||strict_year_month||strict_year_month_day||epoch_millis".
      const formatters = {
        year : (d) => moment(d).format('YYYY'),
        month: (d) => moment(d).format('YYYY-MM'),
        date: (d) => moment(d).format('YYYY-MM-DD'),
        millisecond: (d) => moment(d).valueOf(),
      };
      const resolutions = Object.keys(formatters);

      const chosenResolution : string = faker.random.arrayElement(resolutions);
      const chosenFormater : Function = formatters[chosenResolution];

      return {
        name: faker.lorem.word(),
        keywords: faker.lorem.word(),
        resolution: chosenResolution,
        period: {
          gte: chosenFormater(startDate),
          lte: chosenFormater(endDate),
        },
      };
    case propName === 'version':
      return faker.system.semver();
    case propName === 'title':
      return faker.lorem.words();
    case propName === 'description':
      return faker.lorem.paragraph();
    case propName === 'url':
      return faker.internet.url();
    case propName === 'keywords':
      return [
        faker.lorem.word(),
        faker.lorem.word(),
        faker.lorem.word(),
        faker.lorem.word(),
      ];
    case propName === 'markdown':
      return faker.lorem.paragraphs();
    case fullPropPath === 'revised': // Fall-through
    case fullPropPath === 'publisher': // Fall-through
    case fullPropPath === 'variables': // Fall-through
    default:
      return getMockDataForType(
        propDef,
        propName,
        fullPropPath,
      );
  }
};

const generateSingleMockData = (
  typeDef : LocalTypes.PropertyDefinition,
) : Object => {
  const propNames : Array<string> = Object.keys(typeDef.properties);
  const newDoc : Object = propNames.reduce((acc, propName) => {
    const propDef : Object = typeDef.properties[propName];
    const propValue : any = getMockDataForProperty(propName, propName, propDef);

    return {
      ...acc,
      [propName]: propValue,
    };
  }, {});

  return newDoc;
};

const generateMockDataForIndex = async (
  indexName : string,
  typeDef : LocalTypes.PropertyDefinition,
  count : number,
) : Promise<boolean> => {
  const documentDirectory : string = path.resolve(sourceDataDirectoryPath, indexName);

  fs.ensureDirSync(documentDirectory);
  fs.emptyDirSync(documentDirectory);

  for (let i = 0; i < count; i += 1) {
    const newDoc : Object = generateSingleMockData(typeDef);
    const newDocId : string = uuidv4();
    const newDocPath : string = path.resolve(documentDirectory, `${newDocId}.json`);

    fs.writeJsonSync(newDocPath, newDoc, {
      spaces: 4,
    });
  }

  return true;
};

const generateMockData = async (
  count : number = 100,
) : Promise<boolean> => {
  process.stdout.write(`Scanning ${sourceDataDirectoryPath}\n`);

  const filenameList : Array<string> = glob.sync('*.index.@(json|js)', {
    cwd: sourceDataDirectoryPath,
  });

  const results = await Promise.all(
    filenameList.map(async (filename) : Promise<boolean> => {
      const extname : string = path.extname(filename);
      const basename : string = path.basename(filename, `.index${extname}`);
      const filePath : string = path.resolve(sourceDataDirectoryPath, filename);

      const indexName : string = basename;
      const indexDocument : LocalTypes.IndexDocument = require(filePath);

      const indexMappings : Object = indexDocument.mappings;
      const indexTypes : Array<string> = Object.keys(indexMappings);
    
      // Only consider the first type.
      const majorIndexType : string = indexTypes[0];
      const majorIndexTypeDef : LocalTypes.PropertyDefinition = indexMappings[majorIndexType];

      const dataGenerated : boolean = await generateMockDataForIndex(indexName, majorIndexTypeDef, count);

      return dataGenerated;
    })
  );

  return results.every(Boolean);
};

export default generateMockData;

if (!module.parent) {
  (async () => {
    const success : boolean = await generateMockData(process.argv.length > 2 ? parseInt(process.argv[2], 10) : undefined);

    console.log(`Success: ${success}.`);
  })();
}
