const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const {
  MongoClient,
  ServerApiVersion,
  ObjectId
} = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

//Midddleware
app.use(cors());
app.use(express.json());

function verifyjwt(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message:'Unauthorized Access'});
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded){
    if(err){
      return res.status(403).send({message:'Forbidden Access'});
    }
    req.decoded = decoded;
    //console.log(decoded);
    next();
  });
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.t4diz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1
});

async function run() {
  try {
    await client.connect();
    const servicesCollection = client.db('doctors_portal').collection('services');
    const bookingCollection = client.db('doctors_portal').collection('bookings');
    const userCollection = client.db('doctors_portal').collection('users');
    const doctorCollection = client.db('doctors_portal').collection('doctors');
    const paymentCollection = client.db('doctors_portal').collection('payments');

    const verifyAdmin =  async(req, res, next) =>{
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email:requester});
      if(requesterAccount.role === 'admin'){
        next();
      }
      else{
        return res.status(403).send({message:'Forbidden Access'});
      }
    }


    //for payment process backend site
    app.post("/create-payment-intent", verifyjwt, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price*100;
    
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "inr",
        payment_method_types:['card']
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    /** 
     * API Naming Convention
     * app.get('/booking')  get all booking in this collection
     * app.get('/booking/:id')// add a specific booking
     * app.post('/booking') // add new booking
     * app.patch('/booking/:id') //update a specific booking 
     * app.delete('/booking/:id') //delete a specific booking 
     *  
     */

    // Make Admin
    app.put('/user/admin/:email', verifyjwt, async(req, res) =>{
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email:requester});
      if(requesterAccount.role === 'admin'){
        const filter = {email: email};
        const updateDoc = {
          $set: {role:'admin'}
        };

        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    });

    app.get('/admin/:email', async(req, res) =>{
      const email = req.params.email;
      const user = await userCollection.findOne({email: email});
      const isAdmin = user.role === 'admin';
      res.send({admin: isAdmin});
      
    });


    app.put('/user/:email', async(req, res) =>{
      const email = req.params.email;
      const user = req.body;
      const filter = {email: email};
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      };

      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({email:email},process.env.ACCESS_TOKEN_SECRET,{expiresIn:'1h'});
      res.send({result, token});
    });

    app.get('/users',verifyjwt, async(req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })
    
    app.get('/booking',verifyjwt, async(req, res) =>{
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if(patient === decodedEmail){
        const query = {patient: patient};
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      }else{
        return res.status(403).send({message:'Forbidden Access'});
      }
    })

    //To get booking info for particular id
    app.get('/booking/:id', verifyjwt, async(req, res) =>{
      const id = req.params.id;
      const query = {_id:ObjectId(id)};
      const booking = await bookingCollection.findOne(query);
      res.send(booking); 
    })


    // Post booking to database
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient
      };
      // console.log(query.date);
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({
          success: false,
          booking: exists
        });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({
        success: true,
        result
      });
    })


    //add payment info to database
    app.patch('/booking/:id', verifyjwt, async(req, res) =>{
      const id = req.params.id;
      const payment = req.body;
      const filter = {_id:ObjectId(id)};
      const updatedDoc = {
        $set:{
          paid: true,
          transactionId:payment.transactionId,
        }
      } 
      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
      res.send(updatedDoc);
    })

    // Get all the services
    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query).project({name: 1});
      const services = await cursor.toArray();
      res.send(services);
    })

    

    // Get the available slots for a perticular Service
    app.get('/available', async(req, res) => {

      const date = req.query.date;
      
      // console.log(date);

      // Step 1: Get all the sevices
      const services = await servicesCollection.find().toArray();

      // Step 2: Get all the bookings of the day
      const query = {date: date}; 
      const bookings = await bookingCollection.find(query).toArray();

      //Step 3: For each service 
      services.forEach(service => {
          // Step 4: find bookings for that service
          const serviceBooking = bookings.filter(book => book.treatment === service.name);
          // Step 5: select slots for tha service Bookings ['', '', '']
          const booked = serviceBooking.map(book => book.slot);
          // Step 6: Select those slots that are not in booked slots
          const available = service.slots.filter(slot => !booked.includes(slot));
          // Step 7: Set available to slots to make it earier
          service.slots = available;
      }) 
      res.send(services);
    })


    //Post Doctor
    app.post('/doctor', verifyjwt, verifyAdmin, async(req, res) =>{
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    // Get Doctors
    app.get('/doctor', verifyjwt, verifyAdmin, async(req, res) =>{
      const query = {};
      // const authHeader = req.headers.authorization;
      // console.log('Inside token', authHeader);
      const cursor = doctorCollection.find(query);
      const doctors = await cursor.toArray();
      res.send(doctors);
    });

    //Delete Doctor
    app.delete('/doctor/:email', verifyjwt, verifyAdmin, async(req, res) =>{
      const email = req.params.email;
      const filter = {email: email};
      const result = doctorCollection.deleteOne(filter);
      res.send(result);
    })
  } finally {

  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Doctors portal Server Running')
})

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
})