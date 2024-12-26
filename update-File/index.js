const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, DeleteObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

// Initialize the DynamoDB and S3 clients
const dynamoDbClient = new DynamoDBClient({ region: "us-west-1" });
const s3Client = new S3Client({ region: "us-west-1" });
const JWT_SECRET = "your_jwt_secret_key";

// DynamoDB table name and S3 bucket name
const FILES_TABLE = "Files"; // Replace with your DynamoDB table name
const BUCKET_NAME = "plt-bucket-sumbal"; // Replace with your S3 bucket name

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS, POST, PUT, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400" // Optional: Cache preflight responses
};

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event, null, 2));

    // Handle OPTIONS preflight request for CORS
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: "CORS preflight response" }),
      };
    }

    // Extract the token from the Authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Unauthorized: No token provided" }),
      };
    }
    const token = authHeader.split(" ")[1]; // Extract token without "Bearer "

    // Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Unauthorized: Invalid token", error: error.message }),
      };
    }

    // Extract email from the decoded JWT payload
    const userEmail = decoded.email;
    if (!userEmail) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Invalid token payload: Email missing" }),
      };
    }

    // Parse the request body
    const body = JSON.parse(event.body);
    const id = body.id; // The primary key value
    const newFileName = body.fileName; // New file name if updating
    const newFileData = body.fileData; // Base64-encoded file data if updating

    if (!id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "id is required in the request body" }),
      };
    }

    // Fetch the record from DynamoDB using the partition key (id)
    const getParams = {
      TableName: FILES_TABLE,
      Key: {
        id: { N: id.toString() } // Ensure id is a string if it's numeric
      },
    };
    const getItemCommand = new GetItemCommand(getParams);
    const getResult = await dynamoDbClient.send(getItemCommand);

    // Check if the item was found
    if (!getResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Record not found" }),
      };
    }

    const existingFileName = getResult.Item.fileName.S;
    const existingFileUrl = getResult.Item.fileUrl.S;

    // Prepare the update expression and attribute values
    let updateExpression = "set";
    let expressionAttributeValues = {};

    if (newFileName) {
      updateExpression += " fileName = :newFileName";
      expressionAttributeValues[":newFileName"] = { S: newFileName };
    }

    let newFileUrl = existingFileUrl;
    if (newFileData) {
      // If a new file is provided, replace the existing file in S3
      const newFileKey = uuidv4() + '-' + newFileName.replace(/\s+/g, '-');
      const newFileBuffer = Buffer.from(newFileData, "base64");

      // Upload new file to S3
      const putParams = {
        Bucket: BUCKET_NAME,
        Key: newFileKey,
        Body: newFileBuffer,
        ContentType: "application/octet-stream", // Adjust content type as necessary
      };
      await s3Client.send(new PutObjectCommand(putParams));

      // Update the file URL
      newFileUrl = `https://${BUCKET_NAME}.s3.us-west-1.amazonaws.com/${newFileKey}`;
      
      if (existingFileUrl) {
        // Delete the old file from S3
        const oldFileKey = existingFileUrl.split('/').pop();
        const deleteParams = {
          Bucket: BUCKET_NAME,
          Key: oldFileKey,
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
      }

      if (newFileName) {
        updateExpression += ", ";
      }
      updateExpression += " fileUrl = :newFileUrl";
      expressionAttributeValues[":newFileUrl"] = { S: newFileUrl };
    }

    if (!newFileName && !newFileData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "At least one of fileName or fileData is required" }),
      };
    }

    // Update the item in DynamoDB
    const updateParams = {
      TableName: FILES_TABLE,
      Key: {
        id: { N: id.toString() }, // Ensure id is a string if it's numeric
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    const updateCommand = new UpdateItemCommand(updateParams);
    const updateResult = await dynamoDbClient.send(updateCommand);

    console.log("Update result:", JSON.stringify(updateResult, null, 2));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: "File record updated successfully", updatedAttributes: updateResult.Attributes }),
    };
  } catch (err) {
    console.log("Unexpected Error: ", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Internal Server Error", error: err.message }),
    };
  }
};
