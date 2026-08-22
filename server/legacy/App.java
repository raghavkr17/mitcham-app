import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Scanner;

public class App{
    static Scanner input;
    public static void main(String[] args) throws IOException {
        ArrayList<Integer> stock = new ArrayList<Integer>();
        File file = new File("inventory.txt");
        BufferedReader br = new BufferedReader(new FileReader(file));
        String lastLine = "";
        int count = 0;
        Scanner sc = new Scanner(file);
        while(sc.hasNextLine()) {
            sc.nextLine();
            count++;
        }
        sc.close();
        System.out.println("Number of lines: " + count);
        for (int i = 0; i < count; i++) {
            lastLine = br.readLine();
        }
        String[] items = lastLine.split(",");
        for (int j = 0; j < 6; j++) {
            stock.add((j),Integer.parseInt(items[j + 1]));
        }
        System.out.println(stock);
        br.close();
        //ALL GOOD
        input = new Scanner(System.in);
        System.out.println("What is your name?: ");
        String name = input.nextLine();
        if (name.equals("admin123")) {
            System.out.println("Entered Admin Mode.");
        } 
        else {
            System.out.printf("Hi, %s, Welcome to my South Indian Cuisine.%n", name);
            System.out.println(); 
        }
        main_menu(name, stock);
    }
    public static void restock_program(ArrayList <Integer> stock) throws IOException {
        System.out.println("Do you want to restock any items (y/n)? :");
        String restock = input.next();
        if (restock.equals("y")) {
            System.out.print("Which item do you want to restock? (1-6)? ");
            int itemrest = input.nextInt();
            stock.remove(itemrest-1);
            stock.add(itemrest-1, 100);
            System.out.println("Item " + itemrest + " has been restocked to 100 units.");
            System.out.println("COMPLETED");
            String now = LocalDateTime.now().toString().replace("-", "").replace(" ", "").replace(":", "").replace(".", "");
            now = now.substring(0, now.length() - 4);
            FileWriter j = new FileWriter("inventory.txt", true);
            j.write("\n" + now + "," + stock.get(0) + "," + stock.get(1) + "," + stock.get(2) + "," + stock.get(3) + "," + stock.get(4) + "," + stock.get(5));
            j.close();
            FileWriter t = new FileWriter("records.txt", true);
            t.write("\n" + "ADMIN_RESTOCK" + "/" + "NOCODE" + "/" + now.substring(0, 4) + "-" + now.substring(4, 6) + "-" + now.substring(6, 8) + "/" + now.substring(9, 11) + ":" + now.substring(11, 13) + ":" + now.substring(13, 15) + "/" + "RESTOCK:" + itemrest + "/" + "NA");
            t.close();

        } else if (restock.equals("n")) {
            System.out.println("Ok... Exiting Program...");
            System.exit(0);
        } else {
            System.out.println("Wrong format. Try again."); 
        }
    }
    public static void main_menu(String name, ArrayList <Integer> stock) throws IOException {
        System.out.println("Main Menu");
        System.out.println("___________________________________");
        if (name.equals("admin123")) {
            System.out.println("0. Restock Items (admin only)");
        } 
        System.out.println("1. New Order");
        System.out.println("2. Retrieve Order");
        System.out.println("3. Cancel Order");
        System.out.println("4. Update Order");
        System.out.println("5. Exit \n");
        System.out.println("Choice: ");
        int choice = input.nextInt();
        ArrayList <String> retrlist = new ArrayList <String>();
        if (choice == 1){
            new_order(name,stock, 0, retrlist); 
        } else if (choice == 2){
            retrieval(name, stock);
        } else if (choice == 3) {
            cancelOrder(name, stock);
        } else if (choice == 4) {
            System.out.print("Barcode: ");
            String barcode = input.next();
            updateOrder(barcode, 0, name,stock, 0, retrlist);
        } else if (choice == 5) {
            System.exit(0);
        } else if (choice == 0) {
            System.out.println("Entered Admin Mode.");
            restock_program(stock);
        } else {
            System.exit(0);
        } 
    } 
    public static void new_order(String name, ArrayList <Integer> stock, int currentPrice, ArrayList<String> rtrvlist) throws IOException {
        int total = 0;
        HashMap<String, Integer> prices = new HashMap<String, Integer>();
        prices.put("1", 10);
        prices.put("2", 2);
        prices.put("3", 6);
        prices.put("4", 3);
        prices.put("5", 2);
        prices.put("6", 3);
        int quantity = 0;
        int totalprice = 0;
        System.out.println("     MENU     ");
        System.out.println("______________");
        System.out.println("1 Biriyani Box - $10");
        System.out.println("2 Vada Box - $2");
        System.out.println("3 Idli Box - $6");
        System.out.println("4 Samosa Box - $3");
        System.out.println("5 Masala Tea - $2");
        System.out.println("6 Chicken 65 Box - $3\n");
        System.out.print("Please Choose Menu Item Number : ");
        int item = input.nextInt();
        if(item == 1){
            System.out.println("You have selected, " + item + ": Biriyani Box\n");
        }
        else if(item == 2){
            System.out.println("You have selected, " + item + ": Vada Box\n");
        }
        else if(item == 3){
            System.out.println("You have selected, " + item + ": Idli Box\n");
        }
        else if(item == 4){
            System.out.println("You have selected, " + item + ": Samosa Box\n");
        }
        else if(item == 5){
            System.out.println("You have selected, " + item + ": Masala Tea\n");
        } 
        else if (item == 6) {
            System.out.println("You have selected, " + item + ": Chicken 65 Box\n");
        } 
        else if (item > 6) {
            System.out.println("Please enter number within 1 to 6\n");
        } 
        else if (item < 1) {
            System.out.println("Please enter number within 1 to 6\n");
        }
        else {
            System.out.println("Wrong format. Try again.");
        }
        System.out.println("How many would you like? : ");
        quantity = input.nextInt();
        if (stock.get(item-1) == 0) {
            System.out.println("Sorry, this item is out of stock!");
            System.exit(0);
        }   
        if(quantity > stock.get(item-1)){
            System.out.println("Please enter a lesser quantity!");
            System.exit(0);
        }
        rtrvlist.add(quantity + ":" + item);
        String itemString = String.valueOf(item); 
        total = total + (prices.get(itemString) * quantity);
        totalprice += (prices.get(itemString) * quantity);
        totalprice += currentPrice;
        System.out.println("Total price of all items is ... $" + totalprice + "\n");
        System.out.println("Do you want to finish your order? Yes or No: ");
        String user_input1 = input.next();
        int qty = stock.get(item - 1) - quantity;
        if(user_input1.equals("Yes") || user_input1.equals("yes") || user_input1.equals("y") || user_input1.equals("Y")) {
            System.out.println("The total cost of all items in this order is, $" + totalprice + "\n");
            stock.remove(item - 1);
            stock.add(item - 1, qty);
            FileWriter j = new FileWriter("inventory.txt", true);
            String now = LocalDateTime.now().toString().replace("-", "").replace(" ", "").replace(":", "").replace(".", "");
            now = now.substring(0, now.length() - 4);
            System.out.println(stock);  
            j.write("\n" + now + "," + stock.get(0) + "," + stock.get(1) + "," + stock.get(2) + "," + stock.get(3) + "," + stock.get(4) + "," + stock.get(5));
            j.close();
            String rtrvString = rtrvlist.toString().substring(1, rtrvlist.toString().length() - 1);
            FileWriter t = new FileWriter("records.txt", true);
            t.write("\n" + name.strip() + "/" + now + "/" + now.substring(0, 4) + "-" + now.substring(4, 6) + "-" + now.substring(6, 8) + "/" + now.substring(9, 11) + ":" + now.substring(11, 13) + ":" + now.substring(13, 15) + "/" + rtrvString.strip() + "/" + totalprice);
            t.close();
            System.out.println("Your barcode is... : " + now);
            System.out.println("Make sure to copy it and store it!");
        }
        else if(user_input1.equals("No") || user_input1.equals("no") || user_input1.equals("n") || user_input1.equals("N")) {
            stock.remove(item - 1);
            stock.add(item - 1, qty);
            new_order(name, stock, totalprice, rtrvlist);

        }
        else {
            System.out.println("Please type Yes or No.");
        }
    } 
    public static void retrieval(String name, ArrayList <Integer> stock) throws IOException{
        File file = new File("records.txt");
        Scanner w = new Scanner(file);
        List<String> allrecords = new ArrayList<String>();
        while (w.hasNextLine()) {
            allrecords.add(w.nextLine());
        }
        System.out.print("Barcode: ");
        String barcode = input.next();
        for (int i = 0; i < allrecords.size(); i++) {
            if (allrecords.get(i).contains(barcode)) {
                String[] retrivation = allrecords.get(i).split("/");
                System.out.println("\n");
                System.out.println("Customer Name: " + retrivation[0]);
                System.out.println("Date: " + retrivation[2]);
                System.out.println("Time: " + retrivation[3]);
                String stonk = retrivation[4];
                String[] stonkvalues = stonk.strip().split(",");
                System.out.println("Items: \n");
                for (int j = 0; j < stonkvalues.length; j++) {
                    int itim = stonkvalues[j].charAt(stonkvalues[j].length() - 1) - '0';
                    String itimname = "";
                    if (itim == 1) {
                        itimname = "\tBiriyani Boxes";
                    } else if (itim == 2) {
                        itimname = "\tVada Boxes";
                    } else if (itim == 3) {
                        itimname = "\tIdli Boxes";
                    } else if (itim == 4) {
                        itimname = "\tSamosa Boxes";
                    } else if (itim == 5) {
                        itimname = "\tMasala Tea";
                    } else if (itim == 6) {
                        itimname = "\tChicken 65 Boxes";
                    }
                    System.out.println(itimname + ": " + stonkvalues[j].substring(0, stonkvalues[j].length() - 2));
                }
                System.out.println(" \n Total Price: $" + retrivation[5]);
            }
        }
        System.out.println("\n");
        w.close();
        System.out.println("Press Enter to go back to the main menu.");
        //wait for user to press enter
        System.in.read();
        System.out.println("\n\n\n\n");
        main_menu(name, stock);
    }
    public static void cancelOrder(String name, ArrayList <Integer> stock) throws IOException{
        File file = new File("records.txt");
        File tempFile = new File("temp.txt");
        BufferedWriter writer = new BufferedWriter(new FileWriter(tempFile));
        Scanner w = new Scanner(file);
        List<String> allrecords = new ArrayList<String>();
        while (w.hasNextLine()) {
            allrecords.add(w.nextLine());
        }
        System.out.print("Barcode: ");
        String barcode = input.next();
        for (int i = 0; i < allrecords.size(); i++) {
            if (!(allrecords.get(i).contains(barcode))) {
                writer.write(allrecords.get(i) + System.getProperty("line.separator"));
            }
        }
        writer.close();
        tempFile.renameTo(file);
        tempFile.delete();
        w.close();
        
    }
    public static void updateOrder(String barcode, int count, String name, ArrayList <Integer> stock, int currentPrice, ArrayList<String> rtrvlist) throws IOException {
        if (count == 0) {
            stock.clear();
            File f1le = new File("inventory.txt");
            Scanner w1 = new Scanner(f1le);
            List<String> allrecords2 = new ArrayList<String>();
            while (w1.hasNextLine()) {
                allrecords2.add(w1.nextLine()); 
            }
            String theLine = "";
            for (int i = 0; i < allrecords2.size(); i++) {
                if (allrecords2.get(i).contains(barcode)) {
                    theLine = allrecords2.get(i);
                }
            }
            String[] items4 = theLine.split(",");
            List<String> list = new ArrayList<String>(Arrays.asList(items4));
            list.remove(barcode);
            String [] items = list.toArray(new String[0]);
            for (int j = 0; j < 6; j++) {
                Integer item = Integer.valueOf(items[j]);
                stock.add(item);
            }
            w1.close();
        }
        int total = 0;
        HashMap<String, Integer> prices = new HashMap<String, Integer>();
        prices.put("1", 10);
        prices.put("2", 2);
        prices.put("3", 6);
        prices.put("4", 3);
        prices.put("5", 2);
        prices.put("6", 3);
        int quantity = 0;
        int totalprice = 0;
        System.out.println("     MENU     ");
        System.out.println("______________");
        System.out.println("1 Biriyani Box - $10");
        System.out.println("2 Vada Box - $2");
        System.out.println("3 Idli Box - $6");
        System.out.println("4 Samosa Box - $3");
        System.out.println("5 Masala Tea - $2");
        System.out.println("6 Chicken 65 Box - $3\n");
        System.out.print("Please Choose Menu Item Number : ");
        int item = input.nextInt();
        if(item == 1){
            System.out.println("You have selected, " + item + ": Biriyani Box\n");
        }
        else if(item == 2){
            System.out.println("You have selected, " + item + ": Vada Box\n");
        }
        else if(item == 3){
            System.out.println("You have selected, " + item + ": Idli Box\n");
        }
        else if(item == 4){
            System.out.println("You have selected, " + item + ": Samosa Box\n");
        }
        else if(item == 5){
            System.out.println("You have selected, " + item + ": Masala Tea\n");
        } 
        else if (item == 6) {
            System.out.println("You have selected, " + item + ": Chicken 65 Box\n");
        } 
        else if (item > 6) {
            System.out.println("Please enter number within 1 to 6\n");
        } 
        else if (item < 1) {
            System.out.println("Please enter number within 1 to 6\n");
        }
        else {
            System.out.println("Wrong format. Try again.");
        }
        System.out.println("How many would you like? : ");
        quantity = input.nextInt();
        if (stock.get(item-1) == 0) {
            System.out.println("Sorry, this item is out of stock!");
            System.exit(0);
        }   
        if(quantity > stock.get(item-1)){
            System.out.println("Please enter a lesser quantity!");
            System.exit(0);
        }
        rtrvlist.add(quantity + ":" + item);
        String itemString = String.valueOf(item); 
        total = total + (prices.get(itemString) * quantity);
        totalprice += (prices.get(itemString) * quantity);
        totalprice += currentPrice;
        System.out.println("Total price of all items is ... $" + totalprice + "\n");
        System.out.println("Do you want to finish your order? Yes or No: ");
        String user_input1 = input.next();
        int qty = stock.get(item - 1) - quantity;
        if(user_input1.equals("Yes") || user_input1.equals("yes") || user_input1.equals("y") || user_input1.equals("Y")) {
            System.out.println("The total cost of all items in this order is, $" + totalprice + "\n");
            File file = new File("records.txt");
            File tempFile = new File("temp.txt");
            BufferedWriter writer = new BufferedWriter(new FileWriter(tempFile));
            Scanner w = new Scanner(file);
            List<String> allrecords = new ArrayList<String>();
            String rtrvString = rtrvlist.toString().substring(1, rtrvlist.toString().length() - 1);
            while (w.hasNextLine()) {
                allrecords.add(w.nextLine());
            }
            String now = LocalDateTime.now().toString().replace("-", "").replace(" ", "").replace(":", "").replace(".", "");
            now = now.substring(0, now.length() - 4);
            for (int i = 0; i < allrecords.size(); i++) {
                if (!(allrecords.get(i).contains(barcode))) {
                    writer.write(allrecords.get(i) + System.getProperty("line.separator"));
                }
                else { 
                    writer.write(name.strip() + "/" + now + "/" + now.substring(0, 4) + "-" + now.substring(4, 6) + "-" + now.substring(6, 8) + "/" + now.substring(9, 11) + ":" + now.substring(11, 13) + ":" + now.substring(13, 15) + "/" + rtrvString.strip() + "/" + totalprice + System.getProperty("line.separator"));
                }
            }
            writer.close();
            tempFile.renameTo(file);
            tempFile.delete();
            w.close();
            File file3 = new File("inventory.txt");
            File tempFile3 = new File("temp.txt");
            BufferedWriter writer3 = new BufferedWriter(new FileWriter(tempFile3));
            Scanner w3 = new Scanner(file3);
            List<String> allrecords3 = new ArrayList<String>();
            while (w3.hasNextLine()) {
                allrecords3.add(w3.nextLine());
            }
            for (int i = 0; i < allrecords3.size(); i++) {
                if (!(allrecords3.get(i).contains(barcode))) {
                    writer3.write(allrecords3.get(i) + System.getProperty("line.separator"));
                }
                else {
                    writer3.write(now + "," + stock.get(0) + "," + stock.get(1) + "," + stock.get(2) + "," + stock.get(3) + "," + stock.get(4) + "," + stock.get(5) + System.getProperty("line.separator"));
                }
            }
            writer3.close();
            tempFile3.renameTo(file3);
            tempFile3.delete();
            w3.close();
        }
        else if(user_input1.equals("No") || user_input1.equals("no") || user_input1.equals("n") || user_input1.equals("N")) {
            stock.remove(item - 1);
            stock.add(item - 1, qty);
            count++;
            updateOrder(barcode, count, name, stock, totalprice, rtrvlist);
        }
    }
}

