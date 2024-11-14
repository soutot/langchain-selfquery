# langchain-selfquery

Simple chat app integrating LangChain + RAG + SelfQuery to demonstrate an error when parsing user prompt

## Running

`cp .env.example .env`
Edit .env and add your OpenAI API key

`docker compose up` or `pnpm run dev`

App will start at `localhost:3000`

## Reproducing

1. Run the app
2. Upload any txt file using the clip icon
   2.1 The file will be embedded and a vectorstore folder will be created for RAG
3. Ask any of the following questions:

- How do CAN and LIN signals join in automotive networks as of ISO 11898 version 2.0?
- Where do Zigbee and Wi-Fi signals coexist in IoT devices as of IEEE 802.15.4?
- How do OPC and MQTT protocols select data in IIoT as defined by IEC 62541 version 1.4?
- Where do USB and Ethernet standards join in smart homes as per IEEE 802.3 version 1.0?

You should see the following error in the console:
`Failed to import peggy. Please install peggy (i.e. "npm install peggy" or "yarn add peggy").` thrown by `/node_modules/langchain/dist/output_parsers/expression_type_handlers/base.js`

The criteria seems to be sending SQL words (`as`, `where`, `select`, `from`, `join`) along as a word matching the AttributeInfo (in this case, `version`) in some specific length. Anything different from that would work.