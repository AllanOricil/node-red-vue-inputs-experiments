import Ajv, { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { deepmerge } from "deepmerge-ts";
import { Node } from "./node";
import { ConfigNode } from "./config-node";
import { TypedInput } from "./typed-input";
import * as Credential from "./credential";
import camelCase from "camelcase";
import { isSubclassOf, convertToType } from "./utils";

const ajv = new Ajv({
  allErrors: true,
  useDefaults: true,
  strict: true,
  coerceTypes: true,
  verbose: true,
  validateFormats: true,
});
addFormats(ajv);

/**
 * @class NodeFactory
 * @description Provides a static method to simplify the registration of custom Node-RED
 * node classes developed using the nrg framework. It handles the
 * boilerplate integration with the Node-RED runtime, including type registration,
 * property injection, event handling setup, and admin endpoint creation.
 */
export class NodeFactory {
  /**
   * Registers a custom node built with the nrg framework
   * @static
   * @async
   * @param {object} RED - The Node-RED runtime API object
   * @param {(Node | ConfigNode)} NodeClass - A node class extending Node or ConfigNode
   * @returns {Promise<void>} A promise that resolves when the node type registration and setup are complete. It might wait for the `NodeClass.init()` promise if one is returned.
   * @throws {Error} If NodeClass does not extend `Node` or `ConfigNode`.
   * @throws {Error} If NodeClass does not provide @node({type: "node-type"})
   */
  static async registerType(RED: any, NodeClass: Node | ConfigNode) {
    if (
      !(
        NodeClass.prototype instanceof Node ||
        NodeClass.prototype instanceof ConfigNode
      )
    ) {
      throw new Error(`${NodeClass.name} must extend Node or ConfigNode`);
    }

    const type = NodeClass.__nodeProperties___.type;
    if (!type) {
      throw new Error(
        `${type} must be provided with @node decorator in your class`
      );
    }

    if (Node.RED === undefined) {
      Object.defineProperty(Node, "RED", {
        value: RED,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }

    if (ConfigNode.RED === undefined) {
      Object.defineProperty(ConfigNode, "RED", {
        value: RED,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }

    if (NodeClass.RED === undefined) {
      Object.defineProperty(NodeClass, "RED", {
        value: RED,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }

    if (NodeClass.type === undefined) {
      Object.defineProperty(NodeClass, "type", {
        value: type,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }

    console.log("NodeClass");
    console.log(NodeClass);
    if (typeof NodeClass.init === "function") {
      const result = NodeClass.init();

      if (result instanceof Promise) {
        await result;
      }
    }

    console.log(`CREATING SCHEMAS FOR ${NodeClass}`);
    const inputsValidator: ValidateFunction | null = ajv.compile(
      NodeClass.__nodeProperties___.validation.inputs
    );
    const messageValidator: ValidateFunction | null = NodeClass
      .__nodeProperties___?.validation?.message
      ? ajv.compile(NodeClass.__nodeProperties___.validation.message)
      : undefined;
    console.log(inputsValidator);
    console.log(messageValidator);

    function validateInputs(inputs: any) {
      console.log("VALIDATING INPUTS");
      const isValid = inputsValidator(inputs);
      if (!isValid) {
        const errorDetails = ajv.errorsText(inputsValidator.errors, {
          separator: "\n",
          dataVar: "- inputs",
        });
        console.log(errorDetails);
        return;
      }
      console.log("ALL GOOD");
    }

    function validateMessage(message: Record<string, any>) {
      console.log("VALIDATING MESSAGE");
      const isValid = messageValidator(message);
      if (!isValid) {
        const errorDetails = ajv.errorsText(messageValidator.errors, {
          separator: "\n",
          dataVar: "- message",
        });
        console.log(errorDetails);
        return;
      }
      console.log("ALL GOOD WITH MESSAGE");
    }

    // NOTE: if I assign the extended class to a constant the class name becomes the name of the contant. To avoid losing the NodeClass name I'm storing it in a object prop. Somehow js maintains the name of the NodeClass when I do it
    const classRegistry = {};
    classRegistry["_NodeClass"] = class extends NodeClass {
      /**
       * Creates an instance of a given node class and injects the RED object in it
       * @param {object} config - Configuration object for the node-red node instance.
       */
      constructor(config) {
        super(config);

        validateInputs(deepmerge(config, this.credentials));
        this.setupEventHandlers();
        this.assignDecoratedProps();
      }

      /**
       * Sets up event handlers for the node. Automatically binds methods starting with "on" from the base class
       * to their corresponding events.
       */
      private setupEventHandlers() {
        // TODO: make this dynamic again?
        // ["onInput", "onClose"].forEach((methodName) => {
        //   this.on(
        //     methodName.split("on")[1].toLocaleLowerCase(),
        //     this[methodName]
        //   );
        // });

        this.on("input", (msg, send, done) => {
          try {
            validateMessage(msg);
            this.onInput(msg, send, done);
          } catch (err) {
            this.error("Error during input processing: " + err.message, msg);
            if (done) {
              done(err);
            }
          }
        });
        this.on("close", this.onClose);
      }

      private assignDecoratedProps() {
        const ctor = this.constructor as any;
        const props = ctor.__inputs__ || [];
        console.log("INSIDE DECORATED PROPS METHOD");
        for (const { key, type } of props) {
          // TODO: try prop acessors
          this[key] = isSubclassOf(type, ConfigNode)
            ? RED.nodes.getNode(this.__config[key])
            : type === TypedInput
              ? new TypedInput(this, this.__config[key])
              : type === Credential.Password || type === Credential.Text
                ? convertToType(this.credentials[key], type)
                : convertToType(this.__config[key], type);
        }

        delete this.credentials;

        console.log("FINISHED ASSIGNING PROPS");
      }
    };

    const defaults = function () {
      return NodeClass?.__inputs__
        ? NodeClass.__inputs__.reduce((acc, { key, type }) => {
            if (type === Credential.Password || type === Credential.Text)
              return acc;

            acc[key] = {
              value: "",
              type: isSubclassOf(type, ConfigNode)
                ? type.__nodeProperties___.type
                : undefined,
            };
            return acc;
          }, {})
        : {};
    };

    const credentials = function () {
      return NodeClass?.__inputs__
        ? NodeClass.__inputs__.reduce((acc, { key, type }) => {
            if (type === Credential.Password) {
              acc[key] = {
                type: "password",
              };
            }

            if (type === Credential.Text) {
              acc[key] = {
                type: "text",
              };
            }
            return acc;
          }, {})
        : {};
    };

    RED.nodes.registerType(type, classRegistry["_NodeClass"], {
      credentials: credentials(),
    });

    RED.httpAdmin.get(`/${type}`, function (req, res) {
      let nodeProperties =
        { ...classRegistry["_NodeClass"].__nodeProperties___ } || {};
      nodeProperties.defaults = defaults();
      nodeProperties.credentials = credentials();
      res.json(nodeProperties);
    });
  }
}
