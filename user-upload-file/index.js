const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const jwt = require("jsonwebtoken");

const s3Client = new S3Client({ region: "us-west-1" });
const dynamoDbClient = new DynamoDBClient({ region: "us-west-1" });
const snsClient = new SNSClient({ region: "us-west-1" });

const JWT_SECRET = "your_jwt_secret_key";
const SNS_TOPIC_ARN = "arn:aws:sns:us-west-1:133707302068:your-topic";
const FILES_TABLE = "Files";

exports.handler = async (event) => {
  try {
    console.log(event);

    // Extract the token from the Authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized: No token provided" }),
      };
    }
    const token = authHeader.split(" ")[1];

    // Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized: Invalid token", error: error.message }),
      };
    }

    // Extract email from the decoded JWT payload
    const userEmail = decoded.email;
    if (!userEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid token payload: Email missing" }),
      };
    }

    // Parse the JSON body
    const { fileName, fileData, isPublic } = JSON.parse(event.body);

    if (!fileName || !fileData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "File name and file content are required" }),
      };
    }

    // Decode base64 file content to buffer
    const buffer = Buffer.from(fileData, 'base64');

    // Create a unique file name using timestamp
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;

    // Upload the file to S3
    const uploadParams = {
      Bucket: "s3-playlist-sumbal",
      Key: uniqueFileName,
      Body: buffer,
      ContentType: "application/octet-stream",
    };

    try {
      const command = new PutObjectCommand(uploadParams);
      await s3Client.send(command);

      // Generate the file URL
      const fileUrl = `https://${uploadParams.Bucket}.s3.us-west-1.amazonaws.com/${uniqueFileName}`;

      // Default value for IsPublic is false, if not provided
      const isPublicValue = isPublic !== undefined ? isPublic : false;

      // Save file details in DynamoDB
      const dbParams = {
        TableName: FILES_TABLE,
        Item: {
          id: { N: timestamp.toString() }, // Ensure id is a Number
          fileName: { S: uniqueFileName },
          fileUrl: { S: fileUrl },
          userEmail: { S: userEmail },
          isPublic: { BOOL: isPublicValue },
          createdAt: { S: new Date().toISOString() },
          updatedAt: { S: new Date().toISOString() },
        },
      };

      const dbCommand = new PutItemCommand(dbParams);
      await dynamoDbClient.send(dbCommand);

      // Publish a message to SNS
      const message = {
        bucketName: uploadParams.Bucket,
        fileKey: uniqueFileName,
        destinationBucket: "west-region-sumbal",
      };

      await snsClient.send(
        new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Message: JSON.stringify(message),
        })
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "File uploaded and details saved successfully", fileUrl }),
      };
    } catch (error) {
      console.log("Error: ", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to upload file or save details", error: error.message }),
      };
    }
  } catch (err) {
    console.log("Unexpected Error: ", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error", error: err.message }),
    };
  }
};
